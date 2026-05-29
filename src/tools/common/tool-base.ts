import type * as z from 'zod';
import { type AgentContext } from '../../rendering/context/agent-context';
import type { ApprovalOption, MaybePromise } from '../../types';

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
  protected constructor(
    public internalName: string,
    public name: string,
    public description: string,
    public readonly inputSchema: z.ZodType<TIn>,
    public readonly outputSchema: z.ZodType<TOut>,
    public readonly mightRequireApproval: boolean = true
  ) {}

  public approvalOptions(
    _input: TIn,
    _runtime: AgentContext
  ): MaybePromise<ApprovalOption[]> {
    return DEFAULT_APPROVAL_OPTIONS;
  }

  public requiresApproval(
    _input: TIn,
    _runtime: AgentContext
  ): MaybePromise<boolean> {
    return false;
  }

  public onOptionSelect(
    _input: TIn,
    _option: TApprovalOption,
    _runtime: AgentContext
  ): MaybePromise<ToolSelectionOption> {
    return ToolSelectionOption.ALLOW;
  }

  public abstract handle(input: TIn, _runtime: AgentContext): Promise<TOut>;

  public abstract inputToString(input: TIn): string;

  public abstract outputToString(output: TOut): string;
}
