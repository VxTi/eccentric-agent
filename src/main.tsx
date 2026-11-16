import { config } from 'dotenv';
config({ quiet: true });

import { marked } from 'marked';
import { stdin, stdout } from 'node:process';
import { render } from 'ink';
import { Provider } from 'react-redux';
import { store } from './lib/state';
import { AgentProvider, UserInputProvider } from './rendering/context';
import { App } from './rendering/components/App';
import { terminalRenderer } from './rendering/terminal-markdown-renderer/markdown-renderer';
import chalk from 'chalk';

const controller = new AbortController();

marked.setOptions({
  renderer: terminalRenderer,
});

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    throw new Error('stdin not a TTY. CLI need interactive terminal.\n');
  }
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
      kittyKeyboard: { mode: 'enabled' },
      stdout,
      stdin,
      exitOnCtrlC: true,
      patchConsole: true,
      maxFps: 60,
      incrementalRendering: false,
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
    process.exit(0);
  })
  .catch(err => {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      stdout.write(chalk.yellow('Goodbye.'));
    } else {
      console.trace(`Failure: \n${chalk.red(String(err))}\n`);
    }

    process.exit(1);
  });

function handleExit(statusCode = 0): void {
  process.exit(statusCode);
}
