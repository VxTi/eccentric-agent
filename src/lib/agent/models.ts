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
  modelName: ModelName;
}

export const enum ModelTaskType {
  PLANNING = 'planning',
  IMPLEMENTATION = 'execution',
  INVESTIGATION = 'investigation',
}

export function getModelForTask(task: ModelTaskType): LanguageModelMetadata {
  switch (task) {
    case ModelTaskType.IMPLEMENTATION:
      return {
        modelName: 'gemini-3.8-flash',
        inputTokenPricing: 0.1,
        outputTokenPricing: 0.4,
        contextWindow: 1_048_576,
      };
    case ModelTaskType.INVESTIGATION:
    case ModelTaskType.PLANNING:
      return {
        modelName: 'gemini-3.6-flash',
        inputTokenPricing: 0.1,
        outputTokenPricing: 0.4,
        contextWindow: 1_048_576,
      };
  }
}
