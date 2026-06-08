export const enum Ellipsize {
  START = 'start',
  MIDDLE = 'middle',
  END = 'end',
}
export function ellipsize(
  input: string,
  length: number,
  at: Ellipsize = Ellipsize.END
): string {
  if (input.length <= length) return input;

  if (length <= 3) return '...';

  switch (at) {
    case Ellipsize.START:
      return `...${input.slice(input.length - length + 3, input.length)}`;
    case Ellipsize.MIDDLE:
      return `${input.slice(0, length / 2)}...${input.slice(input.length - length / 2 + 3, input.length)}`;
    case Ellipsize.END:
      return `${input.slice(0, length - 3)}...`;
  }
}
