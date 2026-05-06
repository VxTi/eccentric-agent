import { type EccentricAgent } from './types';
import type * as z from 'zod';

export function createTool<TName extends string, TIn, TOut>(
  internalName: TName,
  name: string,
  description: string,
  inputSchema: z.ZodType<TIn>,
  outputSchema: z.ZodType<TOut>,
  callback: (...input: any[]) => Promise<any>,
  options: { requiresPermission?: boolean } = {}
): EccentricAgent.Tool<TName, TIn, TOut> {
  return {
    name,
    internalName,
    description,
    inputSchema,
    outputSchema,
    handler: callback,
    requiresPermission: options.requiresPermission ?? false,
  };
}
