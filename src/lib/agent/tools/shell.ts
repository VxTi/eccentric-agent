import { type ExecException } from 'node:child_process';
import * as z from 'zod';
import { Result } from '../../result';
import { createTool, ToolSelectionOption } from './common';
import { exec } from 'child_process';

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

const outputSchema = z.object({
  stdout: z.string().describe('Standard output captured from the command'),
  stderr: z.string().describe('Standard error captured from the command'),
  exitCode: z
    .number()
    .describe('The exit code of the command. 0 indicates success.'),
});

const MAX_SHOWN_OUTPUT_LINES = 5;
const MAX_BUFFER_10_MB = 10 * 1024 * 1024;

export const ALLOWED_COMMAND_PATTERNS: RegExp[] = [
  /^ls(\s|$)/,
  /^pwd(\s|$)/,
  /^echo(\s|$)/,
  /^cat\s+[^|;&`$()<>]+$/,
  /^head\s+[^|;&`$()<>]+$/,
  /^tail\s+[^|;&`$()<>]+$/,
  /^wc\s+[^|;&`$()<>]+$/,
  /^grep\s+[^|;&`$()<>]+$/,
  /(^find$)|(^find\s+(?!.*-exec\s)([^|;&`$()<>])+?$)/,
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

export function isAllowedCommand(command: string): boolean {
  const trimmed = command.trim();
  return ALLOWED_COMMAND_PATTERNS.some(pattern => pattern.test(trimmed));
}

type Metadata = { command: string };

export default createTool({
  internalName: 'shell',
  name: 'Shell',
  description:
    'Executes a command and returns its stdout, stderr, and exit code. ' +
    'Use this tool if no other tools are available, or when the user makes the request to do so.',
  inputSchema,
  outputSchema,

  async handle({ command, timeoutMs, cwd }, channel) {
    try {
      return new Promise<
        Result<z.infer<typeof outputSchema>, string, Metadata>
      >(resolve => {
        const process = exec(
          command,
          { cwd, timeout: timeoutMs ?? 30_000, maxBuffer: MAX_BUFFER_10_MB },
          (error, stdout, stderr) => {
            const totalErr = error
              ? [stderr, error.message].join('\n')
              : stderr;

            resolve(Result.Ok({ stdout, stderr: totalErr, exitCode: 0 }));
          }
        );
        process.on('message', msg => {
          channel.notify({ content: JSON.stringify(msg) });
        });
      });
    } catch (err: unknown) {
      const e = err as ExecException;
      // It might've just been a command error, but we still deem it as 'ok', as
      // error results are still processed correctly
      return Result.Ok({
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? e.message,
        exitCode: e.code ?? 1,
      });
    }
  },

  requiresApproval: ({ command }) => !isAllowedCommand(command),

  onOptionSelect({ command }, option: Option) {
    if (option === Option.DENY) return ToolSelectionOption.DENY;

    if (option === Option.TRUST) {
      ALLOWED_COMMAND_PATTERNS.push(new RegExp(command));
    }

    return ToolSelectionOption.ALLOW;
  },

  approvalOptions({ command }) {
    return [
      { option: Option.APPROVE, text: 'Allow' },
      { option: Option.DENY, text: 'Deny' },
      { option: Option.TRUST, text: `Trust '${command}'` },
    ];
  },

  inputToString: ({ command }) => `Shell \`${command}\``,

  outputToString({ exitCode, stderr, stdout }, _, { command }) {
    if (exitCode === 0) {
      const lines = stdout.split('\n');

      return `Shell \`${command}\`\n${lines
        .slice(0, Math.min(lines.length, MAX_SHOWN_OUTPUT_LINES))
        .join('\n')}`;
    }

    return `Command exited with status \`${exitCode}\`: ${stderr.split('\n').slice(0, MAX_SHOWN_OUTPUT_LINES).join('\n')}`;
  },
});
