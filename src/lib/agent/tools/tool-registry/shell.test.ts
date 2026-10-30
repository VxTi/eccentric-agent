import { describe, it, expect } from 'vitest';
import { isAllowedCommand } from './shell';

describe('allowed commands', () => {
  it.each`
    command                                  | expected
    ${'ls -la'}                              | ${true}
    ${'pwd'}                                 | ${true}
    ${'cat some-file'}                       | ${true}
    ${'grep -R somefile'}                    | ${true}
    ${'find somePattern -exec some-Command'} | ${false}
    ${'find somePattern'}                    | ${true}
  `(
    'isAllowedCommand($command) = $expected',
    ({ command, expected }: { command: string; expected: boolean }) => {
      expect(isAllowedCommand(command)).toEqual(expected);
    }
  );
});
