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

export type ToolChannelParams = Omit<GenericMessage, 'id' | 'type'>;

export type SomeTool = IToolDefinition<unknown, object, any>;

export interface IToolDefinition<
  TIn = unknown,
  TOut extends object = object,
  TOutMeta = undefined,
  TApprovalOption extends string = string,
  TInternalName extends string = string,
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
  ): MaybePromise<Result<TOut, string, TOutMeta>>;

  inputToString(
    input: TIn,
    channel: NotifierChannel<ToolChannelParams>
  ): string;

  outputToString(
    output: TOut,
    channel: NotifierChannel<ToolChannelParams>,
    metadata: NoInfer<TOutMeta>
  ): string;
}

type ToolProps<
  TIn extends object = object,
  TOut extends object = object,
  TOutMeta = never,
  TApprovalOption extends string = string,
  TInternalName extends string = string,
> = MakeOptional<
  IToolDefinition<TIn, TOut, TOutMeta, TApprovalOption, TInternalName>,
  'approvalOptions' | 'requiresApproval' | 'onOptionSelect' | 'formatArguments'
> & {};

export function createTool<
  TIn extends object = object,
  TOut extends object = object,
  TOutMeta = never,
  TApprovalOption extends string = string,
  TInternalName extends string = string,
>(
  props: ToolProps<TIn, TOut, TOutMeta, TApprovalOption, TInternalName>
): IToolDefinition<TIn, TOut, TOutMeta, TApprovalOption, TInternalName> {
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
