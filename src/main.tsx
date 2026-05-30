import { config } from 'dotenv';
config({ quiet: true });

import chalk from 'chalk';
import isNumber from 'lodash/isNumber';
import { stdin, stdout } from 'node:process';
import { render } from 'ink';
import {
  AgentProvider,
  ApplicationCancellationProvider,
} from './rendering/context';
import { App } from './rendering/components/App';
import { UserInputProvider } from './rendering/context/user-input';

const ANSI_ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_ALT_SCREEN_EXIT = '\x1b[3J\x1b[?1049l';

// SGR mouse tracking (button events + SGR encoding) so the terminal reports
// wheel scrolls; Ink surfaces the resulting sequences through `useInput`.
const ANSI_MOUSE_ENABLE = '\x1b[?1000h\x1b[?1006h';
const ANSI_MOUSE_DISABLE = '\x1b[?1006l\x1b[?1000l';

const controller = new AbortController();

function restoreScreen(): void {
  stdout.write(ANSI_MOUSE_DISABLE);
  stdout.write(ANSI_ALT_SCREEN_EXIT);
}

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    throw new Error('stdin not a TTY. CLI need interactive terminal.\n');
  }

  stdout.write(ANSI_ALT_SCREEN_ENTER);
  stdout.write(ANSI_MOUSE_ENABLE);

  controller.signal.addEventListener('abort', () =>
    handleExit(
      isNumber(controller.signal.reason) ? controller.signal.reason : 0
    )
  );

  const { waitUntilExit } = render(
    <ApplicationCancellationProvider controller={controller}>
      <AgentProvider>
        <UserInputProvider>
          <App />
        </UserInputProvider>
      </AgentProvider>
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
      stdout.write(`Failure: \n${chalk.red(String(err))}\n`);
    }

    handleExit(1);
  });

function handleExit(statusCode = 0): void {
  restoreScreen();
  process.exit(statusCode);
}
