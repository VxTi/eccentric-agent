import { describe, it, expect } from 'vitest';
import type { ModelMessage } from 'ai';
import { ContextStore } from './context-store';

const CWD = '/repo';

function numbered(from: number, to: number): string {
  const lines: string[] = [];
  for (let n = from; n <= to; n++) lines.push(`${n}\tline ${n}`);
  return lines.join('\n');
}

function readMsg(
  id: string,
  filePath: string,
  from: number,
  to: number
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: id,
        toolName: 'read_file',
        output: {
          type: 'json',
          value: { ok: true, data: { content: numbered(from, to), filePath } },
        },
      },
    ],
  };
}

function editMsg(id: string, filePath: string): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: id,
        toolName: 'replace_in_file',
        output: {
          type: 'json',
          value: { ok: true, data: { filePath, bytesWritten: 1 } },
        },
      },
    ],
  };
}

/** `create_file` reports only `success`; its path comes from the tool call. */
function createCall(id: string, filePath: string): ModelMessage[] {
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: id,
          toolName: 'create_file',
          input: { path: filePath, content: '' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: id,
          toolName: 'create_file',
          output: {
            type: 'json',
            value: { ok: true, data: { success: true } },
          },
        },
      ],
    },
  ];
}

function contentAt(messages: ModelMessage[], index: number): string {
  const message = messages[index];
  if (message === undefined || !Array.isArray(message.content)) {
    throw new Error(`no tool content at ${index}`);
  }
  const part = message.content[0] as unknown as {
    output: { value: { data: { content: string } } };
  };
  return part.output.value.data.content;
}

function store(...messages: ModelMessage[]): ContextStore {
  const context = new ContextStore(CWD);
  context.pushResponse(messages);
  return context;
}

describe('ContextStore', () => {
  it('leaves a single read untouched', () => {
    const context = store(readMsg('r1', '/repo/a.ts', 1, 50));
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('1\tline 1');
    expect(contentAt(out, 0)).not.toContain('elided');
  });

  it('elides an earlier identical re-read, keeping the later copy', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      readMsg('r2', '/repo/a.ts', 1, 50)
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('Contents elided');
    expect(contentAt(out, 0)).toContain('supersedes');
    expect(contentAt(out, 1)).toContain('1\tline 1');
  });

  it('elides an earlier read whose range a later read fully covers', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      readMsg('r2', '/repo/a.ts', 1, 100)
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('Contents elided');
    expect(contentAt(out, 1)).toContain('100\tline 100');
  });

  it('keeps distinct, non-overlapping ranges of the same file', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      readMsg('r2', '/repo/a.ts', 100, 150)
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).not.toContain('elided');
    expect(contentAt(out, 1)).not.toContain('elided');
  });

  it('does not touch reads of different files', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      readMsg('r2', '/repo/b.ts', 1, 50)
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).not.toContain('elided');
    expect(contentAt(out, 1)).not.toContain('elided');
  });

  it('elides a read that predates an edit of the same file as stale', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      editMsg('e1', '/repo/a.ts')
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('Contents elided');
    expect(contentAt(out, 0)).toContain('modified after this read');
  });

  it('keeps a read taken after the edit', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      editMsg('e1', '/repo/a.ts'),
      readMsg('r2', '/repo/a.ts', 1, 50)
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('Contents elided'); // stale (pre-edit)
    expect(contentAt(out, 2)).toContain('1\tline 1'); // fresh (post-edit)
  });

  it('treats create_file as a mutation, invalidating a prior read', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      ...createCall('c1', '/repo/a.ts')
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('Contents elided');
  });

  it('matches relative and absolute paths for the same file', () => {
    const context = store(
      readMsg('r1', 'a.ts', 1, 50), // relative, as the model may pass it
      editMsg('e1', '/repo/a.ts') // absolute
    );
    const out = context.materialize();
    expect(contentAt(out, 0)).toContain('Contents elided');
  });

  it('never mutates the stored history', () => {
    const context = store(
      readMsg('r1', '/repo/a.ts', 1, 50),
      readMsg('r2', '/repo/a.ts', 1, 50)
    );
    context.materialize();
    // Raw history still holds the original content, not a stub.
    expect(contentAt([...context.messages], 0)).toContain('1\tline 1');
  });

  it('clear() empties the history', () => {
    const context = store(readMsg('r1', '/repo/a.ts', 1, 50));
    context.clear();
    expect(context.size).toBe(0);
    expect(context.materialize()).toEqual([]);
  });
});
