import type { JSX } from 'react';
import { Text } from 'ink';
import type { TextFragment } from '../../fragments';
import type { TextColor } from '../../styling';

const COLOR_MAP: Partial<Record<TextColor, string>> = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  yellow: 'yellow',
  cyan: 'cyan',
  magenta: 'magenta',
  white: 'white',
  black: 'black',
  gray: 'gray',
  ['bright-red']: 'redBright',
  ['bright-green']: 'greenBright',
  ['bright-blue']: 'blueBright',
  ['bright-yellow']: 'yellowBright',
  ['bright-cyan']: 'cyanBright',
  ['bright-magenta']: 'magentaBright',
  ['bright-white']: 'whiteBright',
};

interface TextFragmentViewProps {
  fragment: TextFragment;
}

export function TextFragmentView({ fragment }: TextFragmentViewProps): JSX.Element {
  const color = fragment.color ? COLOR_MAP[fragment.color] : undefined;
  const bg =
    fragment.background && fragment.background !== 'none'
      ? (COLOR_MAP[fragment.background] ?? fragment.background)
      : undefined;
  const styles = fragment.styles ?? [];
  return (
    <Text
      color={color}
      backgroundColor={bg}
      bold={styles.includes('bold')}
      italic={styles.includes('italic')}
      underline={styles.includes('underline')}
    >
      {fragment.content}
    </Text>
  );
}
