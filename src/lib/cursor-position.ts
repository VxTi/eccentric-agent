export interface CursorPosition {
  line: number;
  column: number;
}

export function getCursorPosition(
  value: string,
  offset: number
): CursorPosition {
  const lineStart = value.lastIndexOf('\n', offset - 1) + 1;
  const line = countLines(value.slice(0, lineStart));
  return { column: offset - lineStart, line };
}

export function moveCursorVertically(
  value: string,
  offset: number,
  direction: -1 | 1
): number | undefined {
  const lineStarts = getLineStarts(value);
  const { line, column } = getCursorPosition(value, offset);
  const targetStart = lineStarts[line + direction];

  if (targetStart === undefined) return undefined;

  return (
    targetStart +
    Math.min(column, getLineLength(value, lineStarts, line + direction))
  );
}

function getLineStarts(value: string): number[] {
  const starts = [0];
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function getLineLength(
  value: string,
  lineStarts: number[],
  line: number
): number {
  const start = lineStarts[line];
  const nextStart = lineStarts[line + 1];

  if (start === undefined) return 0;
  return nextStart === undefined ? value.length - start : nextStart - start - 1;
}

function countLines(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '\n') count++;
  }
  return count;
}
