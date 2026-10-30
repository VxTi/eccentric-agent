import { config } from 'dotenv';
import { marked } from 'marked';
import { stdin, stdout } from 'node:process';
import { render } from 'ink';
import { Provider } from 'react-redux';
import { store } from './lib/state';
import { AgentProvider, UserInputProvider } from './rendering/context';
import { App } from './rendering/components/App';
import { terminalRenderer } from './rendering/terminal-markdown-renderer/markdown-renderer';
import chalk from 'chalk';

config({ quiet: true });

// SGR mouse tracking (button events + SGR encoding) so the terminal reports
// wheel scrolls; Ink surfaces the resulting sequences through `useInput`.
const ANSI_MOUSE_ENABLE = '\x1b[?1000h\x1b[?1006h';
const ANSI_MOUSE_DISABLE = '\x1b[?1006l\x1b[?1000l';

const controller = new AbortController();

marked.setOptions({
  renderer: terminalRenderer,
});

function restoreScreen(): void {
  stdout.write(ANSI_MOUSE_DISABLE);
}

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    throw new Error('stdin not a TTY. CLI need interactive terminal.\n');
  }

  stdout.write(ANSI_MOUSE_ENABLE);

  controller.signal.addEventListener('abort', () => handleExit());

  const { waitUntilExit } = render(
    <Provider store={store}>
      <AgentProvider>
        <UserInputProvider>
          <App />
        </UserInputProvider>
      </AgentProvider>
    </Provider>,
    {
      stdout,
      stdin,
      exitOnCtrlC: true,
      patchConsole: true,
      maxFps: 60,
      incrementalRendering: true,
      concurrent: true,
      alternateScreen: false,
    }
  );

  await waitUntilExit();
}

process.on('SIGINT', () => {
  controller.abort();
});
process.on('SIGTERM', () => {
  controller.abort();
});

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
