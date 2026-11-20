import { isNil } from '@vxti/typed';
import {
  type LanguageModel,
  generateText as aisdkGenerateText,
  Output,
} from 'ai';
import type * as z from 'zod';
import { type TokenSource } from '../events/events';
import { emitConsumeTokenEvent } from '../events/token-usage';

export enum TaskComplexity {
  SIMPLE = 'simple',
  MEDIUM = 'medium',
  COMPLEX = 'complex',
}

interface GenerateTextProps<T> {
  schema: z.ZodType<T>;
  complexity: TaskComplexity;
  prompt: string;
  systemPrompt: string;
  signal?: AbortSignal;
  source: TokenSource;
  /**
   * Overrides the complexity-based model selection. Use when a task needs a
   * specific model regardless of its complexity tier (e.g. a dedicated
   * decision model).
   */
  model?: LanguageModel;
}

export async function generateText<T>({
  schema,
  complexity,
  prompt,
  systemPrompt,
  signal,
  source,
  model,
}: GenerateTextProps<T>): Promise<T> {
  const {
    output,
    usage: { inputTokens, outputTokens },
  } = await aisdkGenerateText({
    prompt,
    output: Output.object({ schema }),
    instructions: {
      role: 'system',
      content: systemPrompt,
    },
    model: model ?? getAppropriateModel(complexity),
    abortSignal: signal,
  });
  if (
    !isNil(inputTokens) &&
    !isNil(outputTokens) &&
    (inputTokens > 0 || outputTokens > 0)
  ) {
    emitConsumeTokenEvent({
      input: inputTokens,
      output: outputTokens,
      source,
    });
  }

  return output;
}

export function getAppropriateModel(complexity: TaskComplexity): LanguageModel {
  switch (complexity) {
    case TaskComplexity.SIMPLE:
      return 'zai/glm-5.3-flash';
    case TaskComplexity.MEDIUM:
      return 'zai/glm-5.3-flash';
    case TaskComplexity.COMPLEX:
      return 'alibaba/qwen3.8-omni-flash';
  }
}
