import { type Message, MessageType } from '../types/messages';
import { isNonEmptyString, isNotNil } from '@vxti/typed';
import {
  type AsyncIterableStream,
  isLoopFinished,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import { v7 as uuid } from 'uuid';
import { emitPrimaryStepUsage, type StepUsage } from '../events/token-usage';
import { pushEntry, setMessages, store } from '../state';
import { Queue } from '../utils/queue';
import { constructSystemPrompt } from './system-prompt';
import { isAutoApproveEnabled, setAutoApproveEnabled } from './tools';
import { AgentBase, AgentEvents, StatusFlag } from './agent-base';
export { ReasoningEffort } from './agent-base';

export class Agent extends AgentBase {
  // Per-turn abort signal: lets the UI interrupt the active request without
  // tearing down the process, which the app-lifetime signal does.
  private readonly _messageQueue: Queue<string> = new Queue<string>();
  private _gitIgnore: Set<string>;
  private _requestController?: AbortController;

  public constructor(
    appSignal: AbortSignal,
    cwd: string,
    gitIgnore: Set<string> = new Set()
  ) {
    super({ signal: appSignal, cwd });
    this._gitIgnore = gitIgnore;
    appSignal.addEventListener(
      'abort',
      () => this._requestController?.abort(),
      {
        once: true,
      }
    );
  }

  /**
   * Auto mode: unlisted shell commands are vetted by a decision model and run
   * without prompting when it clears them. The enforcement flag lives with the
   * shell tool; this is the user-facing toggle that keeps it in sync.
   */
  public get autoApprove(): boolean {
    return isAutoApproveEnabled();
  }

  public set autoApprove(enabled: boolean) {
    setAutoApproveEnabled(enabled);
    this.emit('auto-mode-change', enabled);
  }

  public toggleAutoApprove(): boolean {
    this.autoApprove = !this.autoApprove;
    return this.autoApprove;
  }

  public clear(): void {
    this.clearContext();
    this.clearMessageQueue();
    this.status.clear(StatusFlag.STREAMING);
  }

  /**
   * Interrupts the in-flight turn, if any. The partial response is discarded
   * and the agent returns to idle, ready for the next message.
   */
  public cancel(): void {
    this._requestController?.abort();
  }

  public get streaming(): boolean {
    return this.status.has(StatusFlag.STREAMING);
  }

  public async submitMessage(message: string): Promise<void> {
    // A turn is already running: queue the message and let the active turn
    // drain it once it finishes, preserving submission order.
    if (this.streaming) {
      this.queueMessage(message);
      return;
    }

    this.emit(AgentEvents.MESSAGE_DELTA, {
      id: uuid(),
      type: MessageType.USER,
      content: message,
    });
    this.recordSkillStateChanges();
    this._context.pushUser(message);
    store.dispatch(pushEntry(message));
    await this.processRequest();

    const next = this.getNextMessageInQueue();
    if (isNonEmptyString(next)) {
      await this.submitMessage(next);
    }
  }

  private async processRequest(): Promise<void> {
    // Created before the loading flag flips so a `cancel()` racing in right
    // after the status change still finds a controller to abort.
    const controller = new AbortController();
    this._requestController = controller;
    this.status.update({
      set: [StatusFlag.STREAMING],
      clear: [StatusFlag.ERROR_STREAMING],
    });

    this._systemPrompt ??= await constructSystemPrompt({
      mcpServers: this._mcpServers,
      cwd: this._cwd,
      gitIgnore: this._gitIgnore,
      skills: this._skills,
    });

    try {
      const result = streamText({
        allowSystemInMessages: true,
        abortSignal: controller.signal,
        model: this._model.id,
        messages: [
          { content: this._systemPrompt, role: 'system' },
          ...this._context.messages,
        ],
        prepareStep: ({ messages }) => ({
          messages: this._context.materialize(messages),
        }),
        reasoning: this._reasoningEffort,
        tools: this._toolset,
        onStepEnd: step => emitPrimaryStepUsage(step.usage),
        onStepStart: () => {},
        stopWhen: isLoopFinished(),
        onError: ({ error }) => {
          if (controller.signal.aborted) return;

          this.emit(AgentEvents.MESSAGE_DELTA, {
            id: uuid(),
            type: MessageType.ASSISTANT,
            content: String(error),
          });
        },
      });

      await this.handleResponseStream(result.stream);

      // Interrupted: the partial turn is discarded rather than committed to
      // the context, so the next message starts from the last full response.
      if (controller.signal.aborted) {
        this.finishInterruptedTurn();
        return;
      }

      const steps = await result.steps;
      this.appendResponseToContext(
        steps.flatMap(step => step.response.messages)
      );
      const finalStep = await result.finalStep;
      // The final step's occupancy snapshot was already emitted by
      // `onStepEnd`, which fires for every step including the last one.
      await this.compactContextIfOverloaded(finalStep.usage, controller.signal);
    } catch (err: unknown) {
      this.status.update({
        clear: [StatusFlag.STREAMING],
        set: [StatusFlag.ERROR_STREAMING],
      });

      if (controller.signal.aborted) {
        this.finishInterruptedTurn();
        return;
      }

      this.emit(AgentEvents.MESSAGE_DELTA, {
        type: MessageType.GENERIC,
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });
      return;
    } finally {
      this._requestController = undefined;
    }

    this.status.clear(StatusFlag.STREAMING);
  }

  private terminateMessageLoadingStates(): void {
    const messages: Message[] = store
      .getState()
      .agent.messages.map(m => ('loading' in m ? { ...m, loading: false } : m));
    store.dispatch(setMessages(messages));
  }

  private finishInterruptedTurn(): void {
    this.emit(AgentEvents.MESSAGE_DELTA, {
      type: MessageType.GENERIC,
      id: uuid(),
      content: chalk.dim('Interrupted'),
    });

    this.status.clear(StatusFlag.STREAMING);
    this.terminateMessageLoadingStates();
  }

  private async compactContextIfOverloaded(
    usage: StepUsage,
    signal: AbortSignal
  ): Promise<void> {
    if (
      !this._contextCompactor.isThresholdExceeded(
        usage,
        this._model.contextWindow
      )
    )
      return;
    this.status.update({
      clear: [StatusFlag.STREAMING, StatusFlag.COMPACTING_CONTEXT_FAILED],
      set: [StatusFlag.COMPACTING_CONTEXT],
    });
    try {
      const summary = await this._contextCompactor.summarize(
        this._context.messages,
        signal
      );
      this.clearContext();
      this._context.pushUser(this.compactionNotice(summary));
      this.emit(AgentEvents.MESSAGE_DELTA, {
        type: MessageType.GENERIC,
        id: uuid(),
        content: chalk.dim(
          'Context window nearing capacity — earlier conversation summarized.'
        ),
      });
    } catch (error: unknown) {
      if (signal.aborted) return;

      this.status.update({
        clear: [StatusFlag.COMPACTING_CONTEXT],
        set: [StatusFlag.COMPACTING_CONTEXT_FAILED],
      });

      this.emit(AgentEvents.MESSAGE_DELTA, {
        type: MessageType.GENERIC,
        id: uuid(),
        failure: true,
        content: `Context compaction failed: ${String(error)}`,
      });
    } finally {
      this.status.clear(StatusFlag.COMPACTING_CONTEXT);
    }
  }

  private compactionNotice(summary: string): string {
    return [
      '[The earlier conversation was summarized to free context window space.]',
      '',
      summary,
      '',
      'Continue from this summary; re-read files on disk when their current contents matter.',
    ].join('\n');
  }

  private async handleResponseStream(
    stream: AsyncIterableStream<TextStreamPart<ToolSet>>
  ): Promise<void> {
    type PartId = string;

    const messages = new Map<PartId, { content: string; messageId: string }>();

    let reasoning: { id: string; startedAt: number } | undefined;

    // Reasoning is surfaced in the message list: a spinner row while the model
    // thinks, collapsed to the elapsed time once the block ends.
    const finishReasoning = (): void => {
      if (reasoning === undefined) return;
      const seconds = Math.max(
        1,
        Math.round((Date.now() - reasoning.startedAt) / 1000)
      );
      this.emit(AgentEvents.MESSAGE_DELTA, {
        type: MessageType.REASONING,
        id: reasoning.id,
        loading: false,
        content: `Thought for ${seconds}s`,
      });
    };

    try {
      for await (const part of stream) {
        switch (part.type) {
          case 'text-start':
            messages.set(part.id, { content: '', messageId: uuid() });
            break;
          case 'text-delta': {
            const prev = messages.get(part.id);
            const updated = (prev?.content ?? '') + part.text;
            const messageId = prev?.messageId ?? uuid();

            messages.set(part.id, { content: updated, messageId });

            if (isNonEmptyString(updated)) {
              this.emit(AgentEvents.MESSAGE_DELTA, {
                type: MessageType.ASSISTANT,
                id: messageId,
                content: updated,
              });
            }
            break;
          }
          case 'text-end': {
            messages.delete(part.id);
            break;
          }
          case 'reasoning-start': {
            const id = uuid();
            reasoning = { id, startedAt: Date.now() };
            this.emit(AgentEvents.MESSAGE_DELTA, {
              type: MessageType.REASONING,
              id,
              loading: true,
              content: 'Thinking...',
            });
            break;
          }
          /*case 'reasoning-delta': {
            this.emit(AgentEvents.MESSAGE_DELTA, {
              type: MessageType.REASONING,
              id: reasoning!.id,
              loading: false,
              content: `Thinking...\n${part.text}`,
            });
            break;
          }*/
          case 'reasoning-end':
            finishReasoning();
            break;
        }
      }
    } catch (err) {
      finishReasoning();
      // An interrupted turn is not an error; `processRequest` reports it.
      if (this._requestController?.signal.aborted) return;
      this.emit(AgentEvents.MESSAGE_DELTA, {
        type: MessageType.GENERIC,
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });

      this.status.update({
        clear: [StatusFlag.STREAMING],
        set: [StatusFlag.ERROR_STREAMING],
      });
    }
  }

  public get messageQueue(): Queue<string> {
    return this._messageQueue;
  }

  public queueMessage(message: string): void {
    this._messageQueue.enqueue(message);
    this.emit(
      AgentEvents.MESSAGE_QUEUE_SIZE_CHANGE,
      this._messageQueue.remaining()
    );
  }

  protected getNextMessageInQueue(): string | undefined {
    const message = this._messageQueue.dequeue();
    if (isNotNil(message)) {
      this.emit(
        AgentEvents.MESSAGE_QUEUE_SIZE_CHANGE,
        this._messageQueue.remaining()
      );
    }
    return message;
  }

  public clearMessageQueue() {
    const remaining = this._messageQueue.remaining();
    this._messageQueue.clear();
    if (remaining > 0) this.emit(AgentEvents.MESSAGE_QUEUE_SIZE_CHANGE, 0);
  }

  public setGitIgnored(ignored: Set<string>): void {
    this._gitIgnore = ignored;
    this.invalidateSystemPrompt();
  }
}
