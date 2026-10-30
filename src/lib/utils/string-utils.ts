export const enum Position {
  START = 'start',
  MIDDLE = 'middle',
  END = 'end',
}
export function ellipsize(
  input: string,
  length: number,
  at: Position = Position.END
): string {
  if (input.length <= length) return input;

  if (length <= 3) return '...';

  switch (at) {
    case Position.START:
      return `...${input.slice(input.length - length + 3, input.length)}`;
    case Position.MIDDLE:
      return `${input.slice(0, length / 2)}...${input.slice(input.length - length / 2 + 3, input.length)}`;
    case Position.END:
      return `${input.slice(0, length - 3)}...`;
  }
}
