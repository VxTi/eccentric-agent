import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { type MouseListener, type WheelListener } from '../rendering/hooks';
import {
  createInkStdin,
  type MouseEvent,
  mouseEventEmitter,
} from './mouse-input';

function createFakeStdin(): {
  stdin: NodeJS.ReadStream;
  write: (chunk: string) => void;
} {
  const source = new PassThrough();
  source.setEncoding('utf8');
  const stdin = createInkStdin(source as unknown as NodeJS.ReadStream);

  return {
    stdin,
    write: chunk => {
      source.emit('data', chunk);
    },
  };
}

function onMouse(listener: MouseListener): () => void {
  mouseEventEmitter.on('mouse', listener);
  return () => {
    mouseEventEmitter.off('mouse', listener);
  };
}

function onWheel(listener: WheelListener): () => void {
  mouseEventEmitter.on('wheel', listener);
  return () => {
    mouseEventEmitter.off('wheel', listener);
  };
}

describe('createInkStdin mouse reports', () => {
  it('parses a motion report into a 0-based viewport move event', () => {
    const { stdin, write } = createFakeStdin();
    const events: MouseEvent[] = [];
    stdin.on('data', () => {});
    const off = onMouse(event => events.push(event));

    write('\u001b[<32;10;5M');

    off();
    expect(events).toEqual([{ kind: 'move', button: 0, x: 9, y: 4 }]);
  });

  it('maps press and release reports to down and up events', () => {
    const { stdin, write } = createFakeStdin();
    const events: MouseEvent[] = [];
    stdin.on('data', () => {});
    const off = onMouse(event => events.push(event));

    write('\u001b[<0;1;1M');
    write('\u001b[<0;1;1m');

    off();
    expect(events).toEqual([
      { kind: 'down', button: 0, x: 0, y: 0 },
      { kind: 'up', button: 0, x: 0, y: 0 },
    ]);
  });

  it('preserves the button code for non-left buttons', () => {
    const { stdin, write } = createFakeStdin();
    const events: MouseEvent[] = [];
    stdin.on('data', () => {});
    const off = onMouse(event => events.push(event));

    write('\u001b[<2;3;4M');

    off();
    expect(events).toEqual([{ kind: 'down', button: 2, x: 2, y: 3 }]);
  });

  it('keeps emitting wheel events and forwards bytes to Ink', () => {
    const { stdin, write } = createFakeStdin();
    const wheel: number[] = [];
    const forwarded: string[] = [];
    stdin.on('data', chunk => forwarded.push(String(chunk)));
    const off = onWheel(({ direction, x, y }) => wheel.push(direction, x, y));

    write('\u001b[<64;1;1M\u001b[<65;1;1M');

    off();
    expect(wheel).toEqual([1, 0, 0, -1, 0, 0]);
    expect(forwarded.join('')).toBe('\u001b[<64;1;1M\u001b[<65;1;1M');
  });

  it('reassembles a report split across two chunks', () => {
    const { stdin, write } = createFakeStdin();
    const events: MouseEvent[] = [];
    stdin.on('data', () => {});
    const off = onMouse(event => events.push(event));

    write('\u001b[<3');
    write('2;7;8M');

    off();
    expect(events).toEqual([{ kind: 'move', button: 0, x: 6, y: 7 }]);
  });
});
