import type * as z from 'zod';
import { type Message } from '../../lib/types/messages';
import { type NotifierChannel } from '../../lib/events/notifier';
import {
  type ApprovalOption,
  type MakeOptional,
  type MaybePromise,
} from '../../lib/types/types';

export const DEFAULT_APPROVAL_OPTIONS: ApprovalOption[] = [
  { option: 'approve', text: 'Approve' },
  { option: 'deny', text: 'Deny' },
];

export const enum ToolSelectionOption {
  ALLOW = 'allow',
  DENY = 'deny',
}

export type ToolChannelParams = [Omit<Message, 'id' | 'type'>];

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
    channel: NotifierChannel<ToolChannelParams>
  ): MaybePromise<ApprovalOption[]>;

  /**
   * @returns `false` if not provided upon tool creation
   */
  requiresApproval(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>
  ): MaybePromise<boolean>;

  /**
   * @returns {@link ToolSelectionOption.ALLOW} if no function is provided
   */
  onOptionSelect(
    input: TIn,
    option: TApprovalOption,
    channel: NotifierChannel<ToolChannelParams>
  ): MaybePromise<ToolSelectionOption>;

  handle(
    input: NoInfer<TIn>,
    channel: NotifierChannel<ToolChannelParams>
  ): Promise<NoInfer<TOut>>;

  inputToString(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>
  ): string;

  outputToString(
    output: TOut,
    channel: NotifierChannel<ToolChannelParams>
  ): string;
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
