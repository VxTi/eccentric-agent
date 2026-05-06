import { type ModelMessage } from 'ai';
import type * as z from 'zod';

declare namespace EccentricAgent {
  export interface Tool<TName extends string, TIn, TOut> {
    internalName: TName;
    name: string;
    description: string;
    inputSchema: z.ZodType<TIn>;
    outputSchema: z.ZodType<TOut>;
    handler: (input: TIn) => Promise<TOut>;
    requiresPermission?: boolean;
  }

  export interface Context<T extends Record<string, Tool<any, any>>> {
    tools: T;
    messages: ModelMessage[];
  }
}
