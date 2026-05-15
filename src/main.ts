import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { config } from 'dotenv';
import { AgentContext } from './common/agent-context';
import { type IO } from './common/types';

config({ quiet: true });

const io: IO = {
  outputStream: stdout,
  inputStream: stdin,
};

const abortController = new AbortController();

async function main(): Promise<void> {
  const context = new AgentContext(io, abortController);

  await context.start();
}

function restoreScreen(): void {
  io.outputStream.write('\x1b[?1049l');
}

process.on('SIGINT', () => {
  abortController.abort();
  restoreScreen();
  process.exit();
});

process.on('SIGTERM', () => {
  abortController.abort();
  restoreScreen();
});

main().catch(err => {
  restoreScreen();
  if (err instanceof Error && err.name === 'ExitPromptError') {
    io.outputStream.write(chalk.yellow('Goodbye.'));
  }

  io.outputStream.write(`\n${chalk.red(String(err))}\n`);
  abortController.abort();
  process.exit(1);
});
