import type * as z from 'zod';
import { type Message } from '../../lib/messages';
import { type NotifierChannel } from '../../lib/notifier';
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
  approvalOptions(
    input: TIn,
    channel: NotifierChannel<[Message]>
  ): MaybePromise<ApprovalOption[]>;

  /**
   * @returns `false` if not provided upon tool creation
   */
  requiresApproval(
    input: TIn,
    channel: NotifierChannel<[Message]>
  ): MaybePromise<boolean>;

  /**
   * @returns {@link ToolSelectionOption.ALLOW} if no function is provided
   */
  onOptionSelect(
    input: TIn,
    option: TApprovalOption,
    channel: NotifierChannel<[Message]>
  ): MaybePromise<ToolSelectionOption>;

  handle(
    input: NoInfer<TIn>,
    channel: NotifierChannel<[Message]>
  ): Promise<NoInfer<TOut>>;
  inputToString(input: TIn, channel: NotifierChannel<[Message]>): string;
  outputToString(output: TOut, channel: NotifierChannel<[Message]>): string;
}

type ToolProps<
  TIn = unknown,
  TOut = unknown,
  TApprovalOption extends string = string,
> = MakeOptional<
  IToolBase<TIn, TOut, TApprovalOption>,
  'approvalOptions' | 'requiresApproval' | 'onOptionSelect'
> & {};

export function createTool<
  TIn = unknown,
  TOut = unknown,
  TApprovalOption extends string = string,
>(
  props: ToolProps<TIn, TOut, TApprovalOption>
): IToolBase<TIn, TOut, TApprovalOption> {
  return {
    ...props,
    approvalOptions: props.approvalOptions ?? (() => DEFAULT_APPROVAL_OPTIONS),
    requiresApproval: props.requiresApproval ?? (() => false),
    onOptionSelect: props.onOptionSelect ?? (() => ToolSelectionOption.ALLOW),
  };
}
