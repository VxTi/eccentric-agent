import chalk from 'chalk';
import { stdout } from 'node:process';
import { config } from 'dotenv';
import { AgentContext } from './common/AgentContext';

config({ quiet: true });

async function main(): Promise<void> {
  const context = new AgentContext();

  await context.start();
}

main().catch(err => {
  stdout.write(`\n${chalk.red(String(err))}\n`);
  process.exit(1);
});
