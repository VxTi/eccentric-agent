// Import the store first: agent-slice -> Agent -> tools -> state/index forms a
// cycle, and the store must be the module that kicks off agent-slice's
// evaluation (as it does in the app, which enters through state/index).
import './store';
import { describe, expect, it } from 'vitest';
import type { GenericMessage, Message } from '../types/messages';
import { agentSlice } from './agent-slice';

function toolMessage(
  id: string,
  toolCall: string,
  extra: Partial<GenericMessage> = {}
): GenericMessage {
  return { id, type: 'generic', content: id, toolCall, ...extra };
}

function stateWith(messages: Message[]): ReturnType<typeof agentSlice.reducer> {
  return agentSlice.reducer(
    agentSlice.getInitialState(),
    agentSlice.actions.setMessages(messages)
  );
}

function dispatchSetMessage(
  state: ReturnType<typeof agentSlice.reducer>,
  message: Message
): ReturnType<typeof agentSlice.reducer> {
  return agentSlice.reducer(state, agentSlice.actions.setMessage(message));
}

describe('agentSlice setMessage tool-call collapsing', () => {
  it('collapses two consecutive completed tool calls into one aggregate message', () => {
    let state = stateWith([
      { id: 'u1', type: 'user', content: 'hi' },
      toolMessage('a', 'read_file'),
    ]);

    state = dispatchSetMessage(state, toolMessage('b', 'read_file'));

    expect(state.messages).toHaveLength(2);
    const collapsed = state.messages[1] as GenericMessage;
    expect(collapsed.collapsed?.count).toBe(2);
    expect(collapsed.collapsed?.tools).toEqual({ read_file: 2 });
    expect(collapsed.content).toContain('2 tool calls');
    expect(collapsed.content).toContain('read 2 files');
  });

  it('keeps the loading message expanded until it completes, then collapses it', () => {
    let state = stateWith([toolMessage('a', 'grep')]);

    state = dispatchSetMessage(
      state,
      toolMessage('b', 'grep', { loading: true })
    );
    expect(state.messages).toHaveLength(2);
    expect((state.messages[1] as GenericMessage).loading).toBe(true);

    state = dispatchSetMessage(state, toolMessage('b', 'grep'));
    expect(state.messages).toHaveLength(1);
    const collapsed = state.messages[0] as GenericMessage;
    expect(collapsed.collapsed?.count).toBe(2);
    expect(collapsed.content).toContain('looked for 2 patterns');
  });

  it('does not collapse across a non-tool message', () => {
    let state = stateWith([
      toolMessage('a', 'read_file'),
      { id: 'as1', type: 'assistant', content: 'some text' },
    ]);

    state = dispatchSetMessage(state, toolMessage('b', 'read_file'));

    expect(state.messages).toHaveLength(3);
    expect(state.messages[2]).toMatchObject({ id: 'b', toolCall: 'read_file' });
  });

  it('falls back to a name ×count summary for tools without a phrase', () => {
    let state = stateWith([toolMessage('a', 'delegate_task')]);

    state = dispatchSetMessage(state, toolMessage('b', 'delegate_task'));

    const collapsed = state.messages.at(-1) as GenericMessage;
    expect(collapsed.collapsed?.tools).toEqual({ delegate_task: 2 });
    expect(collapsed.content).toContain('delegate_task ×2');
  });

  it('continues growing an existing collapsed group', () => {
    let state = stateWith([toolMessage('a', 'read_file')]);

    state = dispatchSetMessage(state, toolMessage('b', 'grep'));
    state = dispatchSetMessage(state, toolMessage('c', 'read_file'));

    const collapsed = state.messages.at(-1) as GenericMessage;
    expect(collapsed.collapsed).toMatchObject({
      count: 3,
      tools: { read_file: 2, grep: 1 },
    });
  });
});
