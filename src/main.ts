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

process.on('SIGINT', () => {
  io.outputStream.write('\x1b[?1000l'); // Disable mouse tracking
  abortController.abort();
  process.exit();
});

process.on('SIGTERM', () => abortController.abort());

main()
  .catch(err => {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      io.outputStream.write(chalk.yellow('Goodbye.'));
    }

    io.outputStream.write(`\n${chalk.red(String(err))}\n`);
    process.exit(1);
  })
  .finally(() => {
    abortController.abort();
  });
