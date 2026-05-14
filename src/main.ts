import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { config } from 'dotenv';
import { AgentContext } from './common/AgentContext';
import { type IO } from './common/types';

config({ quiet: true });

const io: IO = {
  outputStream: stdout,
  inputStream: stdin,
};

async function main(): Promise<void> {
  const context = new AgentContext(io);

  await context.start();
}

process.on('SIGINT', () => {
  io.outputStream.write('\x1b[?1000l'); // Disable mouse tracking
  process.exit();
});

main().catch(err => {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    io.outputStream.write(chalk.yellow('Goodbye.'));
  }

  io.outputStream.write(`\n${chalk.red(String(err))}\n`);
  process.exit(1);
});
