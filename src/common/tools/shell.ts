import { type Output } from 'ai';
import { z } from 'zod';
import type { AgentContext } from '../agent-context';
import { ToolBase, ToolSelectionOption } from '../tools';
import { exec } from 'child_process';
import { promisify } from 'util';
import { type ApprovalOption, type MaybePromise } from '../types';

const execAsync = promisify(exec);

const MAX_SHOWN_OUTPUT_LINES = 5;

export default class ShellCommandTool extends ToolBase<Input, Output, Option> {
  constructor() {
    super(
      'shell',
      'Shell',
      'Executes a shell command and returns its stdout, stderr, and exit code. Commands are restricted to an' +
        ' internal allow-list of safe read-only patterns (e.g. `ls`, `cat`, `git status`, `pnpm list`). Any' +
        ' command outside that list is rejected. Use this tool to inspect the environment, list files, read' +
        ' file contents, or query version control state. Do NOT use it to mutate the filesystem, install' +
        ' packages, or run arbitrary user-supplied commands. This tool requires explicit user permission' +
        ' before each invocation.',
      inputSchema,
      outputSchema
    );
  }

  private isAllowed(command: string): boolean {
    const trimmed = command.trim();
    return ALLOWED_COMMAND_PATTERNS.some(pattern => pattern.test(trimmed));
  }

  public override async handle(
    input: Input,
    _context: AgentContext
  ): Promise<Output> {
    const { command, timeoutMs, cwd } = input;
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };
      return {
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? e.message ?? '',
        exitCode: typeof e.code === 'number' ? e.code : 1,
      };
    }
  }

  public override requiresApproval(
    input: Input,
    _context: AgentContext
  ): MaybePromise<boolean> {
    return this.isAllowed(input.command);
  }

  public override onOptionSelect(
    input: Input,
    option: Option,
    _context: AgentContext
  ): MaybePromise<ToolSelectionOption> {
    if (option === Option.DENY) return ToolSelectionOption.DENY;

    if (option === Option.TRUST) {
      ALLOWED_COMMAND_PATTERNS.push(new RegExp(input.command));
    }

    return ToolSelectionOption.ALLOW;
  }

  public approvalOptions(
    input: Input,
    _context: AgentContext
  ): MaybePromise<ApprovalOption[]> {
    return [
      { option: Option.APPROVE, text: 'Allow' },
      { option: Option.DENY, text: 'Deny' },
      { option: Option.TRUST, text: `Trust '${input.command}'` },
    ];
  }

  public override inputToString(input: Input): string {
    return `Executing \`${input.command}\``;
  }

  public override outputToString(output: Output): string {
    const { exitCode, stderr, stdout } = output;

    if (exitCode === 0) {
      return `Command finished:\n ${stdout
        .split('\n')
        .slice(0, MAX_SHOWN_OUTPUT_LINES)
        .join('\n')}`;
    }

    return `Command exited with status \`${exitCode}\`: ${stderr.split('\n').slice(0, MAX_SHOWN_OUTPUT_LINES).join('\n')}`;
  }
}

const inputSchema = z.object({
  command: z
    .string()
    .describe(
      'The shell command to execute. Commands are matched against an allow-list of safe patterns; commands' +
        ' that do not match are rejected.'
    ),
  cwd: z
    .string()
    .optional()
    .describe(
      'Optional working directory in which to run the command. Defaults to the process working directory.'
    ),
  timeoutMs: z
    .number()
    .optional()
    .describe(
      'Maximum execution time in milliseconds before the command is killed. Defaults to 30000 (30s).'
    ),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  stdout: z.string().describe('Standard output captured from the command'),
  stderr: z.string().describe('Standard error captured from the command'),
  exitCode: z
    .number()
    .describe('The exit code of the command. 0 indicates success.'),
});
type Output = z.infer<typeof outputSchema>;

const ALLOWED_COMMAND_PATTERNS: RegExp[] = [
  /^ls(\s|$)/,
  /^pwd(\s|$)/,
  /^echo(\s|$)/,
  /^cat\s+[^|;&`$()<>]+$/,
  /^head\s+[^|;&`$()<>]+$/,
  /^tail\s+[^|;&`$()<>]+$/,
  /^wc\s+[^|;&`$()<>]+$/,
  /^grep\s+[^|;&`$()<>]+$/,
  /^find\s+[^|;&`$()<>]+$/,
  /^which\s+\S+$/,
  /^node\s+--version$/,
  /^npm\s+(list|ls|view|outdated|run\s+\S+)(\s|$)/,
  /^pnpm\s+(list|ls|view|outdated|run\s+\S+|test|build)(\s|$)/,
  /^git\s+(status|log|diff|show|branch|remote|config\s+--get)(\s|$)/,
  /^tsc\s+--noEmit(\s|$)/,
];

const enum Option {
  APPROVE = 'approve',
  DENY = 'deny',
  TRUST = 'trust',
}
