import './store';
import { describe, expect, it } from 'vitest';
import { chatHistorySlice } from './chat-history-slice';

type ChatHistoryState = ReturnType<typeof chatHistorySlice.reducer>;

function stateWith(
  entries: string[],
  action: Parameters<typeof chatHistorySlice.reducer>[1]
): ChatHistoryState {
  return chatHistorySlice.reducer(
    entries.reduce(
      (state, entry) =>
        chatHistorySlice.reducer(
          state,
          chatHistorySlice.actions.pushEntry(entry)
        ),
      chatHistorySlice.getInitialState()
    ),
    action
  );
}

describe('Chat History Slice', () => {
  it('pushes entries in submission order', () => {
    const state = stateWith(
      ['first'],
      chatHistorySlice.actions.pushEntry('second')
    );

    expect(state.entries).toEqual(['first', 'second']);
  });

  it('clears history', () => {
    const state = stateWith(
      ['first', 'second'],
      chatHistorySlice.actions.clearHistory()
    );

    expect(state.entries).toEqual([]);
  });
});
