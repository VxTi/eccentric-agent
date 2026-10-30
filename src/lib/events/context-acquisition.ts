import { ContextType, type SyncResultRegistry } from './events';
import { store } from '../state/store';

export async function acquireContextInstance<T extends ContextType>(
  type: T
): Promise<SyncResultRegistry[T]> {
  await Promise.resolve();
  const state = store.getState();
  if (type === ContextType.AGENT) {
    return state.agent as unknown as SyncResultRegistry[T];
  }
  if (type === ContextType.FS) {
    return state.fileSystem as unknown as SyncResultRegistry[T];
  }
  throw new Error(`Unknown context type: ${type}`);
}
