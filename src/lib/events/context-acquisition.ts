import {
  type ContextSyncResult,
  type ContextType,
  emitEvent,
  EventName,
  subscribeEvent,
  type SyncResultRegistry,
  unsubscribeEvent,
} from './events';

export async function acquireContextInstance<T extends ContextType>(
  type: T
): Promise<SyncResultRegistry[T]> {
  return new Promise(resolve => {
    const handler = (event: ContextSyncResult<T>) => {
      if (event.detail.type !== type) return;
      unsubscribeEvent(EventName.CONTEXT_SYNC_RESULT, handler);
      resolve(event.detail.context);
    };

    subscribeEvent(EventName.CONTEXT_SYNC_RESULT, handler);
    emitEvent(EventName.CONTEXT_SYNC_REQUEST, type);
  });
}
