import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';
import { config } from 'dotenv';

config({ quiet: true });

export const geminiProvider = createVertex();

type InferModelName<T> = T extends `${string}/${infer F}` ? F : never;
export type ModelName = InferModelName<LanguageModel>;

export interface LanguageModelMetadata {
  contextWindow: number;
  inputTokenPricing: number;
  outputTokenPricing: number;
}

export const MODEL_METADATA = {
  'gemini-3.5-flash': {
    inputTokenPricing: 1.0,
    outputTokenPricing: 9.0,
    contextWindow: 1_048_576,
  },
  'gemini-2.5-flash': {
    inputTokenPricing: 0.3,
    outputTokenPricing: 2.5,
    contextWindow: 1_048_576,
  },
  'gemini-2.5-flash-lite': {
    inputTokenPricing: 0.1,
    outputTokenPricing: 0.4,
    contextWindow: 1_048_576,
  },
} as const satisfies Partial<Record<ModelName, LanguageModelMetadata>>;

function isRecognizedModel(
  model: ModelName
): model is keyof typeof MODEL_METADATA {
  return Object.keys(MODEL_METADATA).includes(model);
}

export function getModelMetadata(model: ModelName): LanguageModelMetadata {
  if (!isRecognizedModel(model)) {
    return {
      inputTokenPricing: 0,
      outputTokenPricing: 0,
      contextWindow: 128_000, // Sort of industry average minimum
    };
  }

  return MODEL_METADATA[model];
}
