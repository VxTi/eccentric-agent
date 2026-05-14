import chalk from 'chalk';
import { stdout } from 'node:process';
import { config } from 'dotenv';
import { AgentContext } from './common/AgentContext';

config({ quiet: true });

async function main(): Promise<void> {
  const context = new AgentContext();

  await context.start();
}

process.on('SIGINT', () => {
  process.stdout.write('\x1b[?1000l'); // Disable mouse tracking
  process.exit();
});

main().catch(err => {
  stdout.write(`\n${chalk.red(String(err))}\n`);
  process.exit(1);
});
