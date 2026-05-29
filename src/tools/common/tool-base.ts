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

interface ToolBaseProps<TIn, TOut> {
  internalName: string;
  name: string;
  description: string;
  readonly inputSchema: z.ZodType<TIn>;
  readonly outputSchema: z.ZodType<TOut>;

  /**
   * Whether the tool might require approval.
   * @default true
   */
  readonly mightRequireApproval?: boolean;
}

export abstract class ToolBase<
  TIn = unknown,
  TOut = unknown,
  TApprovalOption extends string = string,
> {
  public internalName: string;
  public name: string;
  public description: string;
  public readonly inputSchema: z.ZodType<TIn>;
  public readonly outputSchema: z.ZodType<TOut>;
  public readonly mightRequireApproval: boolean;

  protected constructor(props: ToolBaseProps<TIn, TOut>) {
    this.internalName = props.internalName;
    this.name = props.name;
    this.description = props.description;
    this.inputSchema = props.inputSchema;
    this.outputSchema = props.outputSchema;
    this.mightRequireApproval = props.mightRequireApproval ?? true;
  }

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
