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

export interface ModelDefinition {
  id: string;
  label: string;
  /** Maximum tokens the model's primary context window holds. */
  contextWindow: number;
}

// Placeholder context-window sizes — correct against provider documentation
// before relying on the reported occupancy percentage.
export const DEFAULT_MODEL: ModelDefinition = {
  id: 'zai/glm-5.3-flash',
  label: 'GLM 5.3 Flash',
  contextWindow: 200_000,
};

export const MODEL_CATALOG: ModelDefinition[] = [
  DEFAULT_MODEL,
  {
    id: 'alibaba/qwen3.8-omni-flash',
    label: 'Qwen 3.8 Omni Flash',
    contextWindow: 1_000_000,
  },
  { id: 'openai/gpt-5.1', label: 'GPT-5.1', contextWindow: 400_000 },
  {
    id: 'openai/gpt-6-luna-fast',
    label: 'GPT-6 Luna Fast',
    contextWindow: 1_050_000,
  },
  {
    id: 'anthropic/claude-opus-4.6',
    label: 'Claude Opus 4.6',
    contextWindow: 200_000,
  },
  {
    id: 'google/gemini-3-pro',
    label: 'Gemini 3 Pro',
    contextWindow: 1_000_000,
  },
  { id: 'xai/grok-4', label: 'Grok 4', contextWindow: 256_000 },
  {
    id: 'deepseek/deepseek-v3.2',
    label: 'DeepSeek v3.2',
    contextWindow: 128_000,
  },
];

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
