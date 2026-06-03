import { type AgentContext } from '../../rendering/context';
import {
  type AgentContextSyncResult,
  emitEvent,
  EventName,
  subscribeEvent,
  unsubscribeEvent,
} from './events';

export async function acquireContextInstance(): Promise<AgentContext> {
  return new Promise(resolve => {
    const handler = (event: AgentContextSyncResult) => {
      unsubscribeEvent(EventName.CONTEXT_SYNC_RESULT, handler);
      resolve(event.detail);
    };

    subscribeEvent(EventName.CONTEXT_SYNC_RESULT, handler);
    emitEvent(EventName.CONTEXT_SYNC_REQUEST);
  });
}
