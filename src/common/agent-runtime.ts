import type { FileSelector } from '../file-selector';
import type { FileCache } from '../lib/file-cache';
import type { MessageStore } from '../rendering/message-store';
import type { TaskList } from './task-list';
import type { UserInputQueue, UserInputRequest } from './types';

export interface AgentRuntime {
  readonly cwd: string;
  readonly abortController: AbortController;
  readonly taskList: TaskList;
  readonly messageStore: MessageStore;
  readonly fileSelector: FileSelector;
  readonly fileCache: FileCache;
  readonly inputQueue: ManagedUserInputQueue;
  readonly userMessageQueue: UserMessageQueue;
}

export interface DequeuedRequest extends UserInputRequest {
  resolve: (option: string) => void;
}

export interface ManagedUserInputQueue extends UserInputQueue {
  next(): Promise<DequeuedRequest>;
  size(): number;
}

export interface UserMessageQueue {
  submit(message: string): void;
  next(): Promise<string>;
}

interface PendingPromptRequest {
  request: UserInputRequest;
  resolve: (option: string) => void;
}

export function createInputQueue(): ManagedUserInputQueue {
  const pending: PendingPromptRequest[] = [];
  let notify: (() => void) | null = null;

  function signal(): void {
    const n = notify;
    notify = null;
    n?.();
  }

  return {
    request(req) {
      return new Promise<string>(resolve => {
        pending.push({ request: req, resolve });
        signal();
      });
    },
    async next() {
      while (pending.length === 0) {
        await new Promise<void>(resolve => {
          notify = resolve;
        });
      }
      const item = pending.shift();
      if (!item) {
        throw new Error('user input queue invariant violated');
      }
      return {
        toolName: item.request.toolName,
        prompt: item.request.prompt,
        options: item.request.options,
        resolve: item.resolve,
      };
    },
    size() {
      return pending.length;
    },
  };
}

export function createUserMessageQueue(): UserMessageQueue {
  const pending: string[] = [];
  let notify: (() => void) | null = null;

  return {
    submit(message: string) {
      pending.push(message);
      const n = notify;
      notify = null;
      n?.();
    },
    async next() {
      while (pending.length === 0) {
        await new Promise<void>(resolve => {
          notify = resolve;
        });
      }
      return pending.shift()!;
    },
  };
}
