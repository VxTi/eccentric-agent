import { vertex } from '@ai-sdk/google-vertex';
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  type Tool,
  tool as createTool,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import compact from 'lodash/compact';
import first from 'lodash/first';
import { glob } from 'node:fs/promises';
import { useEffect, useMemo, useRef } from 'react';
import { type AgentRuntime, useAgent } from '../context/agent-context';
import { TaskStatus } from '../../task-list';
import { type ToolBase, ToolSelectionOption } from '../../tools';
import { allTools } from '../../tools/registry';
import { useSignal } from '../context/application-cancellation';
import { useMessageStore } from '../context/messages';
import { formatMarkdown, previewArgs } from '../formatting';
import { config } from 'dotenv';
import { type MessageStore } from '../message-store';

config({ quiet: true });

const MAX_TASK_CONTINUATION_TURNS = 10;

const DEFAULT_SYSTEM_PROMPT = `You are an expert at writing, navigating and refactoring codebases.
You've been in the industry for more than 15 years, and have experienced all frameworks of all kinds.
You have a ton of experience with languages such as TypeScript, JavaScript, Java, Kotlin, C++, C and Go.

Whenever the task is unable to be executed due to ambiguity, don't be afraid to prompt the user with questions.
If the task is deemed too complex to execute in one go, make a task list for it and execute it in steps.

A few things to absolutely NEVER do:

- Do not ever delete files without explicit user permissions.
- Whenever simpler tools exist to perform certain actions with, use those.
  If you can read a file without commands, then do so.
- Don't write redundant comments for things that don't demand so. You should
  make your output speak for itself. Whenever the user requests code to be generated,
  the code should be understandable enough so that a comment is not necessary.
`;

export function useAgentEngine(): void {
  const runtime = useAgent();
  const messageStore = useMessageStore();
  const signal = useSignal();

  const model = useMemo<LanguageModel>(() => {
    return vertex('gemini-2.5-flash');
  }, []);
  const tools = useMemo<ToolSet>(
    () => buildToolset(runtime, messageStore, allTools),
    [runtime]
  );
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
        systemPrompt = await loadSystemPrompt(runtime.cwd);
      }
      const taskFragment = renderTaskListFragment(runtime);
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
          vertex: { includeThoughts: false },
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
        messageStore.pushText(
          chalk.red(`Failed to record assistant turn: ${String(err)}\n`)
        );
      }
    };

    void (async () => {
      while (!cancelled) {
        const userMessage = await runtime.userMessageQueue.next();
        if (cancelled) return;
        messages.push({ content: userMessage, role: 'user' });
        await sendTurn();

        let continuations = 0;
        while (
          !cancelled &&
          runtime.taskList.hasIncompleteTasks() &&
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
  }, [runtime, model, tools]);
}

function renderTaskListFragment(runtime: AgentRuntime): string | null {
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

async function loadSystemPrompt(cwd: string): Promise<string> {
  const supportedFileNames: string[] = [
    'AGENTS',
    'AGENT',
    'SKILL',
    'CLAUDE',
    'claude',
    'copilot-instructions',
  ];
  const agentFile = await Array.fromAsync(
    glob(`**/{${supportedFileNames.join(',')}}.md`, { cwd })
  );
  return first(agentFile) ?? DEFAULT_SYSTEM_PROMPT;
}

function buildToolset(
  runtime: AgentRuntime,
  messageStore: MessageStore,
  tools: ToolBase[]
): ToolSet {
  return Object.fromEntries(
    tools.map(tool => [
      tool.internalName,
      bindTool(runtime, messageStore, tool),
    ])
  );
}

function bindTool(
  runtime: AgentRuntime,
  messageStore: MessageStore,
  tool: ToolBase
): Tool {
  return createTool({
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: async (input: unknown) => {
      const processed: unknown = await tool.inputSchema.parse(input);
      const needsApproval = await tool.requiresApproval(processed, runtime);

      if (needsApproval) {
        const options = await tool.approvalOptions(processed, runtime);
        const prompt = `tool "${tool.internalName}" requires approval — args: ${previewArgs(input)}`;

        const chosen = await runtime.inputQueue.request({
          toolName: tool.internalName,
          prompt,
          options,
        });
        const selectionOption = await tool.onOptionSelect(
          processed,
          chosen,
          runtime
        );

        if (selectionOption !== ToolSelectionOption.ALLOW) {
          return {
            error: `User denied permission to run tool "${tool.internalName}".`,
          };
        }
      }

      messageStore.pushText(`${formatMarkdown(tool.inputToString(processed))}`);

      let output: unknown;
      try {
        output = await tool.handle(processed, runtime);
      } catch (err) {
        const message = `Tool "${tool.internalName}" failed: ${String(err)}`;
        messageStore.pushText(chalk.red(`${message}\n`));
        return { error: message, ok: false };
      }

      const parsed = await tool.outputSchema.safeParseAsync(output);

      if (!parsed.success) {
        const message = `Tool "${tool.internalName}" returned an unexpected shape: ${String(parsed.error)}`;
        messageStore.pushText(chalk.red(`${message}\n`));
        return { error: message, ok: false, raw: output };
      }

      messageStore.pushText(
        `↳ ${formatMarkdown(tool.outputToString(parsed.data))}\n`
      );

      return parsed.data;
    },
  });
}
