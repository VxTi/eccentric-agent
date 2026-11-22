import { isNonEmptyArray, isNotNil } from '@vxti/typed';
import { experimental_decide } from 'ai';
import { exec } from 'child_process';
import { type ExecException } from 'node:child_process';
import * as z from 'zod';
import { Result } from '../../../result';
import { ellipsize, Position } from '../../../utils/string-utils';
import { createTool, ToolSelectionOption } from '../tool-definition';

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

const enum Option {
  APPROVE = 'approve',
  DENY = 'deny',
  TRUST = 'trust',
}

export function isAllowedCommand(command: string): boolean {
  const trimmed = command.trim();
  return ALLOWED_COMMAND_PATTERNS.some(allowedCmd => allowedCmd === trimmed);
}

let autoApproveEnabled = false;

export function isAutoApproveEnabled(): boolean {
  return autoApproveEnabled;
}

export function setAutoApproveEnabled(enabled: boolean): void {
  autoApproveEnabled = enabled;
}

/** Decision model used to classify command safety in Auto mode. */
const DECISION_MODEL = 'typesafe-ai/jev-1.14.0';
const DECISION_TIMEOUT_MS = 10_000;

const COMMAND_CONFIDENCE_THRESHOLD = 0.5;

const ALLOWED_COMMAND_PATTERNS: string[] = [];

/**
 * Asks the decision model whether `command` is safe to run unattended. Fails
 * safe: any error, timeout, or abort is treated as "not safe" so the user is
 * still prompted rather than silently running an unvetted command.
 */
async function isCommandSafe(command: string): Promise<boolean> {
  return await experimental_decide({
    model: DECISION_MODEL,
    state: command,
    questions: {
      safe: {
        type: 'boolean',
        instructions:
          'A score indicating how safe the command is to run unattended. ' +
          'A score of 0 means the command is definitely unsafe, and a score of 1 means ' +
          'the command is definitely safe. Scores between 0 and 1 indicate varying degrees of safety.',
      },
    },
    abortSignal: AbortSignal.timeout(DECISION_TIMEOUT_MS),
    providerOptions: {
      gateway: { zeroDataRetention: true },
    },
  })
    .then(res => res.answers.safe.probability >= COMMAND_CONFIDENCE_THRESHOLD)
    .catch(() => false);
}

type Metadata = { command: string };

export const shell = createTool({
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

            resolve(
              Result.Ok(
                {
                  stdout,
                  stderr: totalErr,
                  exitCode: error ? (error.code ?? 1) : 0,
                },
                { command }
              )
            );
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
      return Result.Ok(
        {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? e.message,
          exitCode: e.code ?? 1,
        },
        { command }
      );
    }
  },

  async requiresApproval({ command }) {
    if (isAllowedCommand(command)) return false;

    if (!autoApproveEnabled) return true;

    const safe = await isCommandSafe(command);
    return !safe;
  },

  onOptionSelect({ command }, option: Option) {
    if (option === Option.DENY) return ToolSelectionOption.DENY;

    if (option === Option.TRUST) {
      // Trust only this exact command: escape regex metacharacters and anchor,
      // so e.g. trusting `ls foo.txt` does not also allow unrelated commands via
      // substring or wildcard matching.
      ALLOWED_COMMAND_PATTERNS.push(command.trim());
    }

    return ToolSelectionOption.ALLOW;
  },

  approvalOptions({ command }) {
    return [
      { option: Option.APPROVE, text: 'Allow' },
      { option: Option.DENY, text: 'Deny' },
      {
        option: Option.TRUST,
        text: `Trust '${ellipsize(command, 64, Position.END)}'`,
      },
    ];
  },

  formatArguments: ({ command }) => `\`\`\`shell\n${command}\n\`\`\``,

  inputToString({ command, timeoutMs }) {
    const timeoutStr =
      isNotNil(timeoutMs) && timeoutMs > 0
        ? `with timeout \`${timeoutMs}ms\``
        : '';

    return `Shell \`${command}\` ${timeoutStr}`;
  },
  outputToString({ exitCode, stderr, stdout }, _, { command }) {
    if (exitCode === 0) {
      const lines = stdout.split('\n');

      const formatted = isNonEmptyArray(lines)
        ? `\`\`\`
${lines.slice(0, Math.min(lines.length, MAX_SHOWN_OUTPUT_LINES)).join('\n')}
\`\`\``
        : 'exited successfully.';

      return `Shell \`${command}\`\n${formatted}`;
    }

    return `Command exited with status \`${exitCode}\`: ${stderr.split('\n').slice(0, MAX_SHOWN_OUTPUT_LINES).join('\n')}`;
  },
});
