import { describe, expect, it } from 'vitest';
import type { NonEmptyString } from '@vxti/typed';
import { store } from './store';
import {
  setMessages,
  addMessage,
  setMessage,
  clearMessages,
  setStatus,
  setTasks,
  updateTasks,
} from './agent';
import { setGitInfo, setLoading, setCwd } from './file-system';
import { setInput, setCursorOffset, setInputRequest } from './user-input';
import { setController, exit } from './app';
import { TaskStatus } from '../tasks';
import type { Message } from '../types/messages';

describe('Redux Store and Slices', () => {
  describe('Agent Slice', () => {
    it('should manage messages', () => {
      const msg1: Message = { id: '1', type: 'user', content: 'hello' };
      const msg2: Message = { id: '2', type: 'assistant', content: 'hi' };

      store.dispatch(setMessages([msg1]));
      expect(store.getState().agent.messages).toHaveLength(1);
      expect(store.getState().agent.messages[0].content).toBe('hello');

      store.dispatch(addMessage(msg2));
      expect(store.getState().agent.messages).toHaveLength(2);

      const msg1Updated: Message = {
        id: '1',
        type: 'user',
        content: 'hello world',
      };
      store.dispatch(setMessage(msg1Updated));
      expect(store.getState().agent.messages[0].content).toBe('hello world');

      store.dispatch(clearMessages());
      expect(store.getState().agent.messages).toHaveLength(0);
    });

    it('should manage tasks', () => {
      store.dispatch(
        setTasks([
          {
            id: 'task-1',
            description: 'Do something',
            status: TaskStatus.PENDING,
          },
        ])
      );
      expect(store.getState().agent.taskList.tasks).toHaveLength(1);
      expect(store.getState().agent.taskList.tasks[0].status).toBe(
        TaskStatus.PENDING
      );

      store.dispatch(
        updateTasks([{ id: 'task-1', status: TaskStatus.COMPLETED }])
      );
      expect(store.getState().agent.taskList.tasks[0].status).toBe(
        TaskStatus.COMPLETED
      );
    });

    it('should manage status', () => {
      store.dispatch(setStatus({ loading: true, text: 'Thinking...' }));
      expect(store.getState().agent.status.loading).toBe(true);
      expect(store.getState().agent.status.text).toBe('Thinking...');
    });
  });

  describe('FileSystem Slice', () => {
    it('should update git info and cwd', () => {
      store.dispatch(
        setGitInfo({
          currentBranch: 'main' as unknown as NonEmptyString,
          repoName: 'eccentric-agent' as unknown as NonEmptyString,
          ignored: new Set(['node_modules']),
        })
      );
      expect(store.getState().fileSystem.git.currentBranch).toBe('main');
      expect(store.getState().fileSystem.git.repoName).toBe('eccentric-agent');

      store.dispatch(setLoading(true));
      expect(store.getState().fileSystem.loading).toBe(true);

      store.dispatch(setCwd('/tmp/test'));
      expect(store.getState().fileSystem.cwd).toBe('/tmp/test');
    });
  });

  describe('UserInput Slice', () => {
    it('should update input and cursor', () => {
      store.dispatch(setInput('my command'));
      store.dispatch(setCursorOffset(5));

      expect(store.getState().userInput.input).toBe('my command');
      expect(store.getState().userInput.cursorOffset).toBe(5);

      store.dispatch(
        setInputRequest({
          channelId: 'ch-1',
          options: [{ id: 'opt1', label: 'Option 1' }],
        })
      );
      expect(store.getState().userInput.inputRequest.channelId).toBe('ch-1');
      expect(store.getState().userInput.inputRequest.options).toHaveLength(1);
    });
  });

  describe('App Slice', () => {
    it('should manage controller and exit', () => {
      const controller = new AbortController();
      store.dispatch(setController(controller));
      expect(store.getState().app.controller.signal.aborted).toBe(false);

      store.dispatch(exit());
      expect(store.getState().app.controller.signal.aborted).toBe(true);
    });
  });
});
