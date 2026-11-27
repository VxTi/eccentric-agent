import type { NonEmptyArray } from '@vxti/typed';
import type * as z from 'zod';
import type { Result } from '../../result';
import type { GenericMessage } from '../../types/messages';
import type { NotifierChannel } from '../../events/notifier';
import type {
  ApprovalOption,
  MakeOptional,
  MaybePromise,
} from '../../types/types';
import type { SideBySideDiff } from '../../utils/diff-utils';
import { isBoolean, isNumber, isObject, isString } from 'lodash-es';
import chalk from 'chalk';

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

/**
 * Structured rendering data a tool may attach to its completion message, so
 * the UI can skip re-deriving it from the flattened `content` string on every
 * parse. Payloads never reach the model: they are built from `Result.metadata`,
 * which `core.ts` strips before the tool result enters the context window.
 */
export type ToolMessageData = DiffMessageData;

export interface DiffMessageData {
  kind: 'diff';
  /** The exact strings `outputToString` embedded in the message content, so
   *  the renderer can confirm a diff block belongs to this payload. */
  previous: string;
  current: string;
  /** Side-by-side rows pre-computed from `previous`/`current` at emit time. */
  rows: SideBySideDiff[];
  language?: string;
}

export type ToolCallResult<
  TData,
  TContext,
  TToolCallData extends ToolMessageData | undefined,
> = Result<
  { data: TData; messageMeta?: TToolCallData; context?: TContext },
  string
>;

export type ToolChannelParams = Omit<GenericMessage, 'id' | 'type'>;

export type SomeTool = IToolDefinition<
  unknown,
  object,
  ToolMessageData | undefined
>;

export interface IToolDefinition<
  TIn = unknown,
  TOut extends object = object,
  TMessageMeta extends ToolMessageData | undefined = undefined,
  TApprovalOption extends string = string,
  TInternalName extends string = string,
  TContext extends object = object,
> {
  readonly internalName: TInternalName;
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
  ): MaybePromise<NonEmptyArray<ApprovalOption<TApprovalOption>>>;

  formatArguments(input: TIn): string;

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
  ): MaybePromise<ToolCallResult<TOut, TContext, TMessageMeta>>;

  inputToString(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>
  ): string;

  outputToString(
    output: TOut,
    channel: NotifierChannel<ToolChannelParams>,
    context: NoInfer<TContext>
  ): string;

  /**
   * Builds the structured data attached to the tool's completion message for
   * the UI. Built from `metadata`, which never reaches the model context.
   * @returns `undefined` if not provided upon tool creation
   */
  outputToPayload?(
    output: TOut,
    channel: NotifierChannel<ToolChannelParams>,
    context: NoInfer<TContext>
  ): ToolMessageData | undefined;
}

type ToolProps<
  TIn extends object = object,
  TOut extends object = object,
  TMessageMeta extends ToolMessageData | undefined = undefined,
  TApprovalOption extends string = string,
  TInternalName extends string = string,
  TContext extends object = object,
> = MakeOptional<
  IToolDefinition<
    TIn,
    TOut,
    TMessageMeta,
    TApprovalOption,
    TInternalName,
    TContext
  >,
  'approvalOptions' | 'requiresApproval' | 'onOptionSelect' | 'formatArguments'
> & {};

export function createTool<
  TIn extends object = object,
  TOut extends object = object,
  TMessageMeta extends ToolMessageData | undefined = undefined,
  TApprovalOption extends string = string,
  TInternalName extends string = string,
  TContext extends object = object,
>(
  props: ToolProps<
    TIn,
    TOut,
    TMessageMeta,
    TApprovalOption,
    TInternalName,
    TContext
  >
): IToolDefinition<
  TIn,
  TOut,
  TMessageMeta,
  TApprovalOption,
  TInternalName,
  TContext
> {
  return {
    ...props,
    formatArguments: props.formatArguments ?? defaultArgFormatter,
    approvalOptions:
      props.approvalOptions ??
      (() =>
        DEFAULT_APPROVAL_OPTIONS as NonEmptyArray<
          ApprovalOption<TApprovalOption>
        >),
    requiresApproval: props.requiresApproval ?? (() => false),
    onOptionSelect: props.onOptionSelect ?? (() => ToolSelectionOption.ALLOW),
  };
}

const MAX_FORMATTED_ARGS_LENGTH = 2000;

function defaultArgFormatter(args: object): string {
  const serialized = stringifyArgs(args);
  const truncated =
    serialized.length > MAX_FORMATTED_ARGS_LENGTH
      ? `${serialized.slice(0, MAX_FORMATTED_ARGS_LENGTH)}…`
      : serialized;
  return `\`\`\`json\n${truncated}\n\`\`\``;
}

function stringifyArgs(args: object): string {
  const summarized = Object.entries(args).map(([key, value]) => {
    if (isObject(value)) return `${key}: ...`;

    if (isNumber(value) || isString(value) || isBoolean(value)) {
      return `${key}: ${value}`;
    }

    return `${key}: ${JSON.stringify(value)}`;
  });

  return summarized.map(line => chalk.dim(line)).join('\n\n');
}
