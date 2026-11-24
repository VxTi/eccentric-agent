import { describe, expect, it } from 'vitest';
import type { NonEmptyString } from '@vxti/typed';
import { store } from './store';
import {
  setMessages,
  addMessage,
  setMessage,
  clearMessages,
} from './agent-slice';
import { setGitInfo, setLoading, setCwd } from './file-system';
import { setController, exit } from './app';
import { TaskStatus } from '../tasks';
import { type Message, MessageType } from '../types/messages';

describe('Redux Store and Slices', () => {
  describe('Agent Slice', () => {
    it('should manage messages', () => {
      const msg1: Message = {
        id: '1',
        type: MessageType.USER,
        content: 'hello',
      };
      const msg2: Message = {
        id: '2',
        type: MessageType.ASSISTANT,
        content: 'hi',
      };

      store.dispatch(setMessages([msg1]));
      expect(store.getState().agent.messages).toHaveLength(1);
      expect(store.getState().agent.messages[0]?.content).toBe('hello');

      store.dispatch(addMessage(msg2));
      expect(store.getState().agent.messages).toHaveLength(2);

      const msg1Updated: Message = {
        type: MessageType.USER,
        id: '1',
        content: 'hello world',
      };
      store.dispatch(setMessage(msg1Updated));
      expect(store.getState().agent.messages[0]?.content).toBe('hello world');

      store.dispatch(clearMessages());
      expect(store.getState().agent.messages).toHaveLength(0);
    });

    it('manages tasks through the agent instance', () => {
      const { taskList } = store.getState().agent.agent;
      taskList.set([
        {
          id: 'task-1',
          description: 'Do something',
          status: TaskStatus.PENDING,
        },
      ]);
      expect(taskList.tasks).toHaveLength(1);
      expect(taskList.tasks[0]?.status).toBe(TaskStatus.PENDING);

      taskList.updateTasks([{ id: 'task-1', status: TaskStatus.COMPLETED }]);
      expect(taskList.tasks[0]?.status).toBe(TaskStatus.COMPLETED);
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
