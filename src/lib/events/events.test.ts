import { describe, it, expect, vi } from 'vitest';
import {
  type AgentMessageEvent,
  emitEvent,
  EventName,
  subscribeEvent,
} from './events';

describe('Events', () => {
  it('should handle event subscription correctly', () => {
    const handler = vi.fn();

    subscribeEvent(EventName.AGENT_MESSAGE, handler);
    emitEvent(EventName.AGENT_MESSAGE, {
      type: 'generic',
      content: 'Hello world!',
      id: '123',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining<Pick<AgentMessageEvent, 'detail'>>({
        detail: {
          type: 'generic',
          content: 'Hello world!',
          id: '123',
        },
      })
    );
  });
});
