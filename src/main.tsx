import { config } from 'dotenv';
config({ quiet: true });

import { marked } from 'marked';
import { stdin, stdout } from 'node:process';
import { render } from 'ink';
import { Provider } from 'react-redux';
import { store } from './lib/state';
import { AgentProvider } from './rendering/context/agent-context';
import { UserInputProvider } from './rendering/context/user-input-context';
import { App } from './rendering/components/App';
import { terminalRenderer } from './rendering/terminal-markdown-renderer/markdown-renderer';
import chalk from 'chalk';

const controller = new AbortController();

// Ink 6+ never enables mouse reporting, so the SGR wheel sequences that
// `useScroll` parses (`<64;x;yM`) are never delivered by the terminal.
// Decset 1000 selects button/press-release events, decset 1006 requests the
// SGR encoding that hook's regex expects.
const ENABLE_MOUSE_REPORTING = '\u001b[?1000h\u001b[?1006h';
const DISABLE_MOUSE_REPORTING = '\u001b[?1006l\u001b[?1000l';

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
      incrementalRendering: true,
      concurrent: true,
      alternateScreen: true,
    }
  );

  // Written after `render()` so it lands behind Ink's own setup escapes
  // (alternate-screen entry and the kitty keyboard push), keeping this mode
  // active for the whole session rather than being reset by them.
  stdout.write(ENABLE_MOUSE_REPORTING);

  await waitUntilExit();
  stdout.write(DISABLE_MOUSE_REPORTING);
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
  // Signal-driven exits skip the post-`waitUntilExit()` reset above.
  stdout.write(DISABLE_MOUSE_REPORTING);
  process.exit(statusCode);
}
