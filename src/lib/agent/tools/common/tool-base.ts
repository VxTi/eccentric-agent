import type * as z from 'zod';
import { type GenericMessage } from '../../../types/messages';
import { type NotifierChannel } from '../../../events/notifier';
import {
  type ApprovalOption,
  type MakeOptional,
  type MaybePromise,
} from '../../../types/types';

export const enum ToolSelectionOption {
  ALLOW = 'allow',
  DENY = 'deny',
}

export const DEFAULT_APPROVAL_OPTIONS: ApprovalOption[] = [
  { option: ToolSelectionOption.ALLOW, text: 'Approve' },
  { option: ToolSelectionOption.DENY, text: 'Deny' },
];

export type ToolChannelParams = [Omit<GenericMessage, 'id' | 'type'>];

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
   * Whether the tool should be executed quietly
   */
  readonly quiet?: boolean;

  /**
   * @returns {@link DEFAULT_APPROVAL_OPTIONS} if not provided upon tool creation
   */
  approvalOptions(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>
  ): MaybePromise<ApprovalOption<TApprovalOption>[]>;

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
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>,
    signal: AbortSignal
  ): Promise<TOut>;

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
    approvalOptions:
      props.approvalOptions ??
      (() => DEFAULT_APPROVAL_OPTIONS as ApprovalOption<TApprovalOption>[]),
    requiresApproval: props.requiresApproval ?? (() => false),
    onOptionSelect: props.onOptionSelect ?? (() => ToolSelectionOption.ALLOW),
  };
}
