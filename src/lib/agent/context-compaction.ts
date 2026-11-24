import { isNonEmptyString } from '@vxti/typed';
import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import * as z from 'zod';
import type { StepUsage } from '../events/token-usage';
import { generateText, TaskComplexity } from './inference';

/**
 * Fraction of the context window at which the conversation is summarized and
 * the history replaced with that summary.
 */
const COMPACTION_THRESHOLD = 0.8;

/** Long tool results are truncated in the transcript; exact file bodies are re-readable from disk. */
const MAX_TOOL_RESULT_CHARS = 2_000;

const SUMMARY_SCHEMA = z.object({
  summary: z
    .string()
    .describe('The dense, factual summary of the conversation so far.'),
});

const SUMMARY_SYSTEM_PROMPT = [
  'You summarize a coding-agent conversation so its history can be replaced by your summary.',
  'Preserve, as concretely as possible:',
  "- The user's goal and every instruction or preference they stated.",
  '- Decisions made and approaches ruled out.',
  '- Files that were read or modified (with paths) and what changed.',
  '- Commands run, errors encountered, and how each was resolved.',
  '- The current state of the work and the exact next steps.',
  'Keep identifiers — file paths, symbol names, commands — verbatim.',
  'Omit pleasantries, retries, and anything superseded by a later attempt.',
].join('\n');

/**
 * Decides when the primary agent's context window is nearly full and produces
 * the summary that replaces the stored history when it is.
 */
export class ContextCompactor {
  /**
   * The last step's usage is the occupancy snapshot of the window: its prompt
   * carried the whole conversation and its reply was appended to it. Unknown
   * input tokens fail safe — no compaction is triggered on a guess.
   */
  public isThresholdExceeded(usage: StepUsage, contextWindow: number): boolean {
    if (usage.inputTokens === undefined) return false;
    const consumed = usage.inputTokens + (usage.outputTokens ?? 0);
    return consumed >= contextWindow * COMPACTION_THRESHOLD;
  }

  public async summarize(
    messages: readonly ModelMessage[],
    signal?: AbortSignal
  ): Promise<string> {
    const transcript = messages
      .map(messageToTranscriptBlock)
      .filter(isNonEmptyLine)
      .join('\n\n');

    const { summary } = await generateText({
      schema: SUMMARY_SCHEMA,
      complexity: TaskComplexity.MEDIUM,
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      prompt: `Summarize the following agent conversation transcript.\n\n<transcript>\n${transcript}\n</transcript>`,
      signal,
    });

    return summary;
  }
}

function messageToTranscriptBlock(message: ModelMessage): string {
  if (typeof message.content === 'string') {
    return `${message.role}: ${message.content}`;
  }

  const lines = message.content
    .map(partToTranscriptLine)
    .filter(isNonEmptyLine);
  return lines.length === 0 ? '' : `${message.role}:\n${lines.join('\n')}`;
}

type ContentPart = Exclude<ModelMessage['content'], string>[number];

function isNonEmptyLine(line: string | undefined): line is string {
  return isNonEmptyString(line);
}

function partToTranscriptLine(part: ContentPart): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'tool-call':
      return toolCallToLine(part);
    case 'tool-result':
      return toolResultToLine(part);
    default:
      return '';
  }
}

function toolCallToLine(part: ToolCallPart): string {
  return `[tool call ${part.toolName}] ${JSON.stringify(part.input)}`;
}

function toolResultToLine(part: ToolResultPart): string {
  const output = toolResultOutputToText(part);
  return `[tool result for ${part.toolName}] ${truncate(output)}`;
}

function toolResultOutputToText(part: ToolResultPart): string {
  switch (part.output.type) {
    case 'text':
      return part.output.value;
    case 'json':
      return JSON.stringify(part.output.value);
    default:
      return '';
  }
}

function truncate(text: string): string {
  return text.length <= MAX_TOOL_RESULT_CHARS
    ? text
    : `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]`;
}
