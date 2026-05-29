import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { config } from 'dotenv';
import { render } from 'ink';
import { AgentProvider } from './rendering/context/agent-context';
import { App } from './rendering/components/App';
import { ApplicationCancellationProvider } from './rendering/context/application-cancellation';
import { MessagesProvider } from './rendering/context/messages';

config({ quiet: true });

const ANSI_ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_ALT_SCREEN_EXIT = '\x1b[?1049l\x1b[3J';

const controller = new AbortController();

function restoreScreen(): void {
  stdout.write(ANSI_ALT_SCREEN_EXIT);
}

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    throw new Error('stdin not a TTY. CLI need interactive terminal.\n');
  }

  stdout.write(ANSI_ALT_SCREEN_ENTER);

  controller.signal.addEventListener('abort', () => handleExit(0));

  const { waitUntilExit } = render(
    <ApplicationCancellationProvider controller={controller}>
      <MessagesProvider>
        <AgentProvider>
          <App />
        </AgentProvider>
      </MessagesProvider>
    </ApplicationCancellationProvider>,
    {
      stdout,
      stdin,
      exitOnCtrlC: true,
      patchConsole: false,
      maxFps: 120,
      incrementalRendering: true,
      concurrent: true,
    }
  );

  await waitUntilExit();
}

process.on('SIGINT', controller.abort.bind(controller));
process.on('SIGTERM', controller.abort.bind(controller));

main()
  .then(() => handleExit(0))
  .catch(err => {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      stdout.write(chalk.yellow('Goodbye.'));
    } else {
      stdout.write(`\n${chalk.red(String(err))}\n`);
    }

    handleExit(1);
  });

function handleExit(statusCode = 0): void {
  restoreScreen();
  console.log('Exiting...');
  process.exit(statusCode);
}
