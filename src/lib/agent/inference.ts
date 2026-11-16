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
}

export async function generateText<T>({
  schema,
  complexity,
  prompt,
  systemPrompt,
  signal,
  source,
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
    model: getAppropriateModel(complexity),
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
    case TaskComplexity.MEDIUM:
    case TaskComplexity.COMPLEX:
      return 'alibaba/qwen3.8-omni-flash';
  }
}
