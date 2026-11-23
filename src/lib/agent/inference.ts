import {
  type LanguageModel,
  generateText as aisdkGenerateText,
  Output,
  experimental_decide,
} from 'ai';
import type * as z from 'zod';

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
  model,
}: GenerateTextProps<T>): Promise<T> {
  const { output } = await aisdkGenerateText({
    prompt,
    output: Output.object({ schema }),
    instructions: {
      role: 'system',
      content: systemPrompt,
    },
    model: model ?? getAppropriateModel(complexity),
    abortSignal: signal,
  });

  return output;
}

export function decide(...args: Parameters<typeof experimental_decide>) {
  return experimental_decide(...args);
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
