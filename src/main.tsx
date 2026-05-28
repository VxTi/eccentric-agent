import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { config } from 'dotenv';
import { render } from 'ink';
import { AgentProvider } from './common/agent-context';
import {
  createInputQueue,
  createUserMessageQueue,
  type AgentRuntime,
} from './common/agent-runtime';
import { TaskList } from './common/task-list';
import { createFileSelector } from './file-selector';
import { FileCache } from './lib/file-cache';
import { App } from './rendering/components/App';
import { MessageProvider } from './rendering/message-context';
import { MessageStore } from './rendering/message-store';
import { textBlock } from './rendering/fragments';

config({ quiet: true });

const ANSI_ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_ALT_SCREEN_EXIT = '\x1b[?1049l';

const abortController = new AbortController();

function restoreScreen(): void {
  stdout.write(ANSI_ALT_SCREEN_EXIT);
}

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    stdout.write(
      chalk.red('stdin not a TTY. CLI need interactive terminal.\n')
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const messageStore = new MessageStore();

  messageStore.push(
    textBlock({
      content: `${chalk.blue('◆')} ${chalk.bold('Eccentric Agent')}${chalk.dim(
        ' — type @ for files, Ctrl+C to' + ' exit\n\n'
      )}`,
      align: 'center',
    })
  );

  const runtime: AgentRuntime = {
    cwd,
    abortController,
    taskList: new TaskList(),
    messageStore,
    fileCache: new FileCache(cwd),
    fileSelector: createFileSelector(cwd),
    inputQueue: createInputQueue(),
    userMessageQueue: createUserMessageQueue(),
  };

  stdout.write(ANSI_ALT_SCREEN_ENTER);

  const instance = render(
    <MessageProvider store={messageStore}>
      <AgentProvider runtime={runtime}>
        <App />
      </AgentProvider>
    </MessageProvider>,
    {
      stdout,
      stdin,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  );

  await instance.waitUntilExit();
  restoreScreen();
}

process.on('SIGINT', () => {
  abortController.abort();
  restoreScreen();
  process.exit();
});

process.on('SIGTERM', () => {
  abortController.abort();
  restoreScreen();
});

main().catch(err => {
  restoreScreen();
  if (err instanceof Error && err.name === 'ExitPromptError') {
    stdout.write(chalk.yellow('Goodbye.'));
  }

  stdout.write(`\n${chalk.red(String(err))}\n`);
  abortController.abort();
  process.exit(1);
});
