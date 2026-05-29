import type * as z from 'zod';
import { type AgentRuntime } from './rendering/context/agent-context';
import type { ApprovalOption, MaybePromise } from './types';

export const DEFAULT_APPROVAL_OPTIONS: ApprovalOption[] = [
  { option: 'approve', text: 'Approve' },
  { option: 'deny', text: 'Deny' },
];

export const enum ToolSelectionOption {
  ALLOW = 'allow',
  DENY = 'deny',
}

export abstract class ToolBase<
  TIn = unknown,
  TOut = unknown,
  TApprovalOption extends string = string,
> {
  public readonly internalName: string;
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: z.ZodType<TIn>;
  public readonly outputSchema: z.ZodType<TOut>;

  protected constructor(
    internalName: string,
    name: string,
    description: string,
    inputSchema: z.ZodType<TIn>,
    outputSchema: z.ZodType<TOut>
  ) {
    this.internalName = internalName;
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
  }

  public approvalOptions(
    _input: TIn,
    _runtime: AgentRuntime
  ): MaybePromise<ApprovalOption[]> {
    return DEFAULT_APPROVAL_OPTIONS;
  }

  public requiresApproval(
    _input: TIn,
    _runtime: AgentRuntime
  ): MaybePromise<boolean> {
    return false;
  }

  public onOptionSelect(
    _input: TIn,
    _option: TApprovalOption,
    _runtime: AgentRuntime
  ): MaybePromise<ToolSelectionOption> {
    return ToolSelectionOption.ALLOW;
  }

  public abstract handle(input: TIn, _runtime: AgentRuntime): Promise<TOut>;

  public abstract inputToString(input: TIn): string;

  public abstract outputToString(output: TOut): string;
}
