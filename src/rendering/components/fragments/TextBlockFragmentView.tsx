import type { JSX } from 'react';
import { Box, Text } from 'ink';
import { formatMarkdown } from '../../formatting';
import type { TextBlockFragment } from '../../fragments';

interface TextBlockFragmentViewProps {
  fragment: TextBlockFragment;
}

export function TextBlockFragmentView({
  fragment,
}: TextBlockFragmentViewProps): JSX.Element {
  const justify =
    fragment.align === 'center'
      ? 'center'
      : fragment.align === 'right'
        ? 'flex-end'
        : 'flex-start';

  return (
    <Box width="80%" alignSelf="center" justifyContent={justify} flexShrink={0}>
      <Text>{formatMarkdown(fragment.content)}</Text>
    </Box>
  );
}
