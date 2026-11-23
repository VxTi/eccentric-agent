import { config } from 'dotenv';
config({ quiet: true });

import { marked } from 'marked';
import { stdin, stdout } from 'node:process';
import { render } from 'ink';
import { Provider } from 'react-redux';
import { defaultController, store } from './lib/state';
import { AgentProvider } from './rendering/context/agent-context';
import { MouseProvider } from './rendering/context/mouse-context';
import { UserInputProvider } from './rendering/context/user-input-context';
import { App } from './rendering/components/App';
import { terminalRenderer } from './rendering/terminal-markdown-renderer/markdown-renderer';
import { createInkStdin } from './lib/mouse-input';
import chalk from 'chalk';

// Ink never asks the terminal to report mouse events, so we opt in ourselves:
// decset 1003 selects any-event tracking (motion, press and release), decset
// 1006 requests the SGR encoding (`ESC[<32;x;yM`). Ink then drops these
// sequences before `useInput` (it discards any control sequence it can't map
// to a key), so `createInkStdin` taps stdin directly to deliver mouse events.
const ENABLE_MOUSE_REPORTING = '\u001b[?1003h\u001b[?1006h';
const DISABLE_MOUSE_REPORTING = '\u001b[?1006l\u001b[?1003l\u001b[?1000l';

marked.setOptions({
  renderer: terminalRenderer,
});

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    throw new Error('stdin not a TTY. CLI need interactive terminal.\n');
  }
  defaultController.signal.addEventListener('abort', () => handleExit());

  const { waitUntilExit } = render(
    <Provider store={store}>
      <MouseProvider>
        <AgentProvider>
          <UserInputProvider>
            <App />
          </UserInputProvider>
        </AgentProvider>
      </MouseProvider>
    </Provider>,
    {
      kittyKeyboard: { mode: 'enabled' },
      stdout,
      stdin: createInkStdin(stdin),
      // Ctrl+C is handled in the app: it first interrupts an in-flight agent
      // turn and only exits once the agent is idle (see UserInputProvider).
      exitOnCtrlC: false,
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
  defaultController.abort();
});
process.on('SIGTERM', () => {
  defaultController.abort();
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
