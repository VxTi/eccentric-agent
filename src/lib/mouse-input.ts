import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Ink 8 parses terminal control sequences and deliberately drops the ones it
// cannot map to a key — mouse reports included (see ink's `components/App.js`,
// which returns early when `key.name === ''`). So SGR wheel sequences never
// reach `useInput`. To receive them we tap the real stdin ourselves, emit wheel
// events, and forward every byte to a proxy stream that Ink reads from, so
// keyboard input keeps working unchanged.

// SGR mouse report: ESC [ < Cb ; Cx ; Cy ('M' press | 'm' release).
const WHEEL_SEQUENCE = /\u001b\[<(\d+);\d+;\d+[Mm]/g;
const WHEEL_UP_ANSI_CODE = 64;
const WHEEL_DOWN_ANSI_CODE = 65;
// Enough to hold one wheel report (e.g. `ESC[<65;1920;1080M`) split across two
// stdin chunks, so a partial sequence is not lost between reads.
const MAX_PARTIAL_SEQUENCE_LENGTH = 24;

export type WheelDirection = 1 | -1;
export type WheelListener = (direction: WheelDirection) => void;

const emitter = new EventEmitter();
// One listener per mounted scroll view; don't warn as views come and go.
emitter.setMaxListeners(0);

function emitWheelEvents(buffer: string): string {
  WHEEL_SEQUENCE.lastIndex = 0;
  let consumedUpTo = 0;
  let match: RegExpExecArray | null;

  while ((match = WHEEL_SEQUENCE.exec(buffer)) !== null) {
    const button = Number.parseInt(match[1]!, 10);
    if (button === WHEEL_UP_ANSI_CODE) {
      emitter.emit('wheel', 1);
    } else if (button === WHEEL_DOWN_ANSI_CODE) {
      emitter.emit('wheel', -1);
    }
    consumedUpTo = WHEEL_SEQUENCE.lastIndex;
  }

  // Retain only a short tail after the last complete match — it may contain the
  // start of a wheel sequence that completes in the next chunk.
  const tail = buffer.slice(consumedUpTo);
  return tail.length > MAX_PARTIAL_SEQUENCE_LENGTH
    ? tail.slice(-MAX_PARTIAL_SEQUENCE_LENGTH)
    : tail;
}

/**
 * Wrap `source` (the real stdin) so Ink reads from a proxy while we observe the
 * raw byte stream for mouse-wheel reports. The proxy forwards every byte
 * untouched and delegates the TTY/raw-mode controls Ink needs.
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
    pending = emitWheelEvents(pending + chunk);
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
