import { config } from 'dotenv';
config({ quiet: true });

import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { stdin, stdout } from 'node:process';
import { render } from 'ink';
import { AgentProvider } from './rendering/context';
import { App } from './rendering/components/App';
import { UserInputProvider } from './rendering/context/user-input-context';
import { defaultOptions } from './rendering/markdown-options';
import { appController } from './signal';

const ANSI_ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_ALT_SCREEN_EXIT = '\x1b[3J\x1b[?1049l';

// SGR mouse tracking (button events + SGR encoding) so the terminal reports
// wheel scrolls; Ink surfaces the resulting sequences through `useInput`.
const ANSI_MOUSE_ENABLE = '\x1b[?1000h\x1b[?1006h';
const ANSI_MOUSE_DISABLE = '\x1b[?1006l\x1b[?1000l';

marked.setOptions({
  // eslint-disable-next-line
  // @ts-ignore
  renderer: new TerminalRenderer(defaultOptions),
});

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

  appController.signal.addEventListener('abort', () => handleExit());

  const { waitUntilExit } = render(
    <UserInputProvider>
      <AgentProvider>
        <App />
      </AgentProvider>
    </UserInputProvider>,
    {
      stdout,
      stdin,
      exitOnCtrlC: true,
      patchConsole: true,
      maxFps: 30,
      incrementalRendering: true,
      concurrent: true,
      alternateScreen: true,
    }
  );

  await waitUntilExit();
}

process.on('SIGINT', appController.abort.bind(appController));
process.on('SIGTERM', appController.abort.bind(appController));

main()
  .then(() => {
    restoreScreen();
    process.exit(0);
  })
  .catch(err => {
    restoreScreen();
    if (err instanceof Error && err.name === 'ExitPromptError') {
      stdout.write(chalk.yellow('Goodbye.'));
    } else {
      console.trace(`Failure: \n${chalk.red(String(err))}\n`);
    }

    process.exit(1);
  });

function handleExit(statusCode = 0): void {
  restoreScreen();
  process.exit(statusCode);
}
