import type * as z from 'zod';
import {
  type ApprovalOption,
  type MakeOptional,
  type MaybePromise,
} from '../../types';

export const DEFAULT_APPROVAL_OPTIONS: ApprovalOption[] = [
  { option: 'approve', text: 'Approve' },
  { option: 'deny', text: 'Deny' },
];

export const enum ToolSelectionOption {
  ALLOW = 'allow',
  DENY = 'deny',
}

export interface IToolBase<
  TIn = unknown,
  TOut = unknown,
  TApprovalOption extends string = string,
> {
  readonly internalName: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TIn>;
  readonly outputSchema: z.ZodType<TOut>;

  /**
   * Whether the tool might require approval.
   * @default true
   */
  readonly mightRequireApproval?: boolean;

  /**
   * @returns {@link DEFAULT_APPROVAL_OPTIONS} if not provided upon tool creation
   */
  approvalOptions(input: TIn): MaybePromise<ApprovalOption[]>;

  /**
   * @returns `false` if not provided upon tool creation
   */
  requiresApproval(input: TIn): MaybePromise<boolean>;

  /**
   * @returns {@link ToolSelectionOption.ALLOW} if no function is provided
   */
  onOptionSelect(
    input: TIn,
    option: TApprovalOption
  ): MaybePromise<ToolSelectionOption>;

  handle(input: TIn): Promise<TOut>;
  inputToString(input: TIn): string;
  outputToString(output: TOut): string;
}

export function createTool<
  TIn = unknown,
  TOut = unknown,
  TApprovalOption extends string = string,
>(
  props: MakeOptional<
    IToolBase<TIn, TOut, TApprovalOption>,
    'approvalOptions' | 'requiresApproval' | 'onOptionSelect'
  >
): IToolBase<TIn, TOut, TApprovalOption> {
  return {
    ...props,
    approvalOptions: props.approvalOptions ?? (() => DEFAULT_APPROVAL_OPTIONS),
    requiresApproval: props.requiresApproval ?? (() => false),
    onOptionSelect: props.onOptionSelect ?? (() => ToolSelectionOption.ALLOW),
  };
}
