import type * as z from 'zod';
import { type Result } from '../../result';
import { type GenericMessage } from '../../types/messages';
import { type NotifierChannel } from '../../events/notifier';
import {
  type ApprovalOption,
  type MakeOptional,
  type MaybePromise,
} from '../../types/types';

export const enum ToolSelectionOption {
  ALLOW = 'allow',
  ALWAYS_ALLOW = 'always-allow',
  DENY = 'deny',
}

export const DEFAULT_APPROVAL_OPTIONS: ApprovalOption[] = [
  { option: ToolSelectionOption.ALLOW, text: 'Approve' },
  { option: ToolSelectionOption.ALWAYS_ALLOW, text: 'Always approve' },
  { option: ToolSelectionOption.DENY, text: 'Deny' },
];

export type ToolChannelParams = Omit<GenericMessage, 'id' | 'type'>;

export type SomeTool = IToolDefinition<unknown, object, any>;

export interface IToolDefinition<
  TIn = unknown,
  TOut extends object = object,
  TOutMeta = undefined,
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
    input: NoInfer<TIn>,
    option: TApprovalOption,
    channel: NotifierChannel<ToolChannelParams>
  ): MaybePromise<ToolSelectionOption>;

  handle(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>,
    signal: AbortSignal
  ): MaybePromise<Result<TOut, string, TOutMeta>>;

  inputToString(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>
  ): string;

  outputToString(
    output: TOut,
    channel: NotifierChannel<ToolChannelParams>,
    metadata: TOutMeta
  ): string;
}

type ToolProps<
  TIn = unknown,
  TOut extends object = object,
  TOutMeta = never,
  TApprovalOption extends string = string,
> = MakeOptional<
  IToolDefinition<TIn, TOut, TOutMeta, TApprovalOption>,
  'approvalOptions' | 'requiresApproval' | 'onOptionSelect'
> & {};

export function createTool<
  TIn = unknown,
  TOut extends object = object,
  TOutMeta = never,
  TApprovalOption extends string = string,
>(
  props: ToolProps<TIn, TOut, TOutMeta, TApprovalOption>
): IToolDefinition<TIn, TOut, TOutMeta, TApprovalOption> {
  return {
    ...props,
    approvalOptions:
      props.approvalOptions ??
      (() => DEFAULT_APPROVAL_OPTIONS as ApprovalOption<TApprovalOption>[]),
    requiresApproval: props.requiresApproval ?? (() => false),
    onOptionSelect: props.onOptionSelect ?? (() => ToolSelectionOption.ALLOW),
  };
}
