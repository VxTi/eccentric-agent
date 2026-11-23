import { hasArrayLength } from '@vxti/typed';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Ink 8 parses terminal control sequences and deliberately drops the ones it
// cannot map to a key — mouse reports included (see ink's `components/App.js`,
// which returns early when `key.name === ''`). So mouse reports never reach
// `useInput`. To receive them we tap the real stdin ourselves, emit mouse
// events, and forward every byte to a proxy stream that Ink reads from, so
// keyboard input keeps working unchanged.

// SGR mouse report: ESC [ < Cb ; Cx ; Cy ('M' press | 'm' release). Cb encodes
// the action: plain button reports use 0-2, motion adds 32 to the button code,
// and 64/65 are wheel up/down. Coordinates are 1-based terminal rows/columns
// and are converted here to 0-based viewport coordinates.
const MOUSE_SEQUENCE = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/g;
const MOTION_FLAG = 32;
const WHEEL_FLAG = 64;
// Enough to hold one mouse report (e.g. `ESC[<32;1920;1080M`) split across two
// stdin chunks, so a partial sequence is not lost between reads.
const MAX_PARTIAL_SEQUENCE_LENGTH = 24;

export type MouseButton = 0 | 1 | 2;
export type MouseEventKind = 'move' | 'down' | 'up';

export interface MouseReport {
  kind: MouseEventKind;
  button: MouseButton;
  // 0-based column/row within the terminal viewport.
  x: number;
  y: number;
}

export type WheelDirection = 1 | -1;
export type WheelListener = (direction: WheelDirection) => void;
export type MouseListener = (event: MouseReport) => void;

const emitter = new EventEmitter();
// One listener per mounted scroll view; don't warn as views come and go.
emitter.setMaxListeners(0);

function emitMouseEvents(buffer: string): string {
  MOUSE_SEQUENCE.lastIndex = 0;
  let consumedUpTo = 0;
  let match: RegExpExecArray | null;

  while (hasArrayLength((match = MOUSE_SEQUENCE.exec(buffer)), 4)) {
    const code = Number.parseInt(match[1], 10);
    const x = Number.parseInt(match[2], 10) - 1;
    const y = Number.parseInt(match[3], 10) - 1;

    const isScrolling = (code & WHEEL_FLAG) !== 0;

    if (isScrolling) {
      // Wheel reports have no press/release split, so any final byte maps.
      if (code === WHEEL_FLAG) {
        emitter.emit('wheel', 1);
      } else if (code === WHEEL_FLAG + 1) {
        emitter.emit('wheel', -1);
      }
    } else {
      const kind: MouseEventKind =
        (code & MOTION_FLAG) !== 0 ? 'move' : match[4] === 'M' ? 'down' : 'up';
      const button = (code & 3) as MouseButton;

      emitter.emit('mouse', { kind, button, x, y });
    }
    consumedUpTo = MOUSE_SEQUENCE.lastIndex;
  }

  // Retain only a short tail after the last complete match — it may contain the
  // start of a mouse report that completes in the next chunk.
  const tail = buffer.slice(consumedUpTo);
  return tail.length > MAX_PARTIAL_SEQUENCE_LENGTH
    ? tail.slice(-MAX_PARTIAL_SEQUENCE_LENGTH)
    : tail;
}

/**
 * Wrap `source` (the real stdin) so Ink reads from a proxy while we observe the
 * raw byte stream for mouse reports. The proxy forwards every byte untouched
 * and delegates the TTY/raw-mode controls Ink needs.
 */
export function createInkStdin(
  source: NodeJS.ReadStream = process.stdin
): NodeJS.ReadStream {
  const proxy = new PassThrough();
  const stdin: NodeJS.ReadStream = proxy as never;

  stdin.isTTY = true;
  stdin.setRawMode = (mode: boolean) => {
    source.setRawMode(mode);
    return stdin;
  };
  // Ink calls ref()/unref() on the raw-mode stream; PassThrough has neither.
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;

  let pending = '';
  source.setEncoding('utf8');
  source.on('data', (chunk: string) => {
    proxy.write(chunk);
    pending = emitMouseEvents(pending + chunk);
  });
  source.once('end', () => proxy.end());

  return stdin;
}

export function onWheel(listener: WheelListener): () => void {
  emitter.on('wheel', listener);
  return () => {
    emitter.off('wheel', listener);
  };
}

export function onMouse(listener: MouseListener): () => void {
  emitter.on('mouse', listener);
  return () => {
    emitter.off('mouse', listener);
  };
}
