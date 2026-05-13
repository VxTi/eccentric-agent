import type * as z from 'zod';
import { type AgentContext } from './AgentContext';
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

  /**
   * A given set of approval options for when the tool requires user approval.
   * @optional
   */
  public approvalOptions(
    _input: TIn,
    _context: AgentContext
  ): MaybePromise<ApprovalOption[]> {
    return DEFAULT_APPROVAL_OPTIONS;
  }

  /**
   * Whether this tool requires user approval
   * If it does, it will show the user {@link approvalOptions}
   * @optional
   */
  public requiresApproval(
    _input: TIn,
    _context: AgentContext
  ): MaybePromise<boolean> {
    return false;
  }

  /**
   * Handler for when the user has selected an option.
   * When returned truthy, the tool is invoked.
   * @optional
   */
  public onOptionSelect(
    _input: TIn,
    _option: TApprovalOption,
    _context: AgentContext
  ): MaybePromise<ToolSelectionOption> {
    return ToolSelectionOption.ALLOW;
  }

  public abstract handle(input: TIn, _context: AgentContext): Promise<TOut>;

  /**
   * Returns a human-readable variant of this tool call
   */
  public abstract inputToString(input: TIn): string;

  /**
   * Returns a human-readable variant of the result of this tool
   */
  public abstract outputToString(output: TOut): string;
}
