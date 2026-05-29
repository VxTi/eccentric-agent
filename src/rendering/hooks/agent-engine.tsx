import { vertex } from '@ai-sdk/google-vertex';
import { type LanguageModel, type ModelMessage, stepCountIs, streamText, type ToolSet } from 'ai';
import chalk from 'chalk';
import compact from 'lodash/compact';
import { useEffect, useMemo, useRef } from 'react';
import { TaskStatus } from '../../lib/tasks';
import { toolRegistry } from '../../tools';
import { useSignal, type AgentContext, useAgent } from '../context';
import { formatMarkdown } from '../formatting';
import { config } from 'dotenv';

config({ quiet: true });

export function useAgentEngine(): void {
  const context = useAgent();
  const signal = useSignal();

  const tools = useMemo<ToolSet>(() => buildToolset(context, toolRegistry), [context]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const tokensUsed = 0;

    let cancelled = false;
    const messages: ModelMessage[] = [];
    let systemPrompt: string | undefined;

    const ensureSystemPrompt = async (): Promise<string> => {
      if (!systemPrompt) {
        systemPrompt = await loadSystemPrompt(context.cwd);
      }
      const taskFragment = renderTaskListFragment(context);
      return compact([systemPrompt, taskFragment]).join('\n');
    };

    const sendTurn = async (): Promise<void> => {
      const prompt = await ensureSystemPrompt();
      let buffer = '';
      messageStore.setStatus(`processing… - ${tokensUsed}`);

      const result = streamText({
        allowSystemInMessages: true,
        abortSignal: signal,
        model,
        messages: [{ content: prompt, role: 'system' }, ...messages],
        tools,
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        },
        stopWhen: stepCountIs(20),
      });

      try {
        for await (const chunk of result.textStream) {
          buffer += chunk;
        }
      } catch (err) {
        messageStore.pushText(chalk.red(`Stream error: ${String(err)}\n`));
      } finally {
        messageStore.setStatus(`↓ ${tokensUsed}`);
      }

      if (buffer.length > 0) {
        messageStore.pushText(`${chalk.blue('◆ ') + formatMarkdown(buffer)}\n`);
      }

      try {
        const finalMessages = (await result.response).messages;
        messages.push(...finalMessages);
      } catch (err) {
        messageStore.pushText(chalk.red(`Failed to record assistant turn: ${String(err)}\n`));
      }
    };

    void (async () => {
      while (!cancelled) {
        const userMessage = await context.userMessageQueue.next();
        if (cancelled) return;
        messages.push({ content: userMessage, role: 'user' });
        await sendTurn();

        let continuations = 0;
        while (
          !cancelled &&
          context.taskList.hasIncompleteTasks() &&
          continuations < MAX_TASK_CONTINUATION_TURNS
        ) {
          continuations += 1;
          messages.push({
            content:
              'The task list still has incomplete tasks. Continue working on the' +
              ' next pending or in-progress task and update the task list as you' +
              ' make progress. Do not wait for further user input.',
            role: 'user',
          });
          await sendTurn();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context, model, tools]);
}

function renderTaskListFragment(runtime: AgentContext): string | null {
  if (!runtime.taskList.hasTasks) return null;

  const lines = runtime.taskList.tasks.map(task => {
    const mapping: Record<TaskStatus, string> = {
      [TaskStatus.COMPLETED]: '[x]',
      [TaskStatus.IN_PROGRESS]: '[~]',
      [TaskStatus.PENDING]: '[ ]',
    };
    return `  ${mapping[task.status]} (${task.id}) ${task.description}`;
  });

  return [
    'Current task list (markers: [ ] pending, [~] in_progress, [x] completed):',
    ...lines,
    'While any task is not completed you MUST keep working autonomously.' +
      ' Use `update_task_list` to mark tasks "in_progress" before starting' +
      ' and "completed" when done. Only stop once every task is completed.',
  ].join('\n');
}
