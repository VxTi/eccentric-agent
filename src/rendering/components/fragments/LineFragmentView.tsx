import type { JSX } from 'react';
import { Box, Text } from 'ink';
import type { LineFragment } from '../../fragments';
import { TextFragmentView } from './TextFragmentView';

interface LineFragmentViewProps {
  fragment: LineFragment;
}

export function LineFragmentView({
  fragment,
}: LineFragmentViewProps): JSX.Element {
  return (
    <Box width="80%" alignSelf="center" flexShrink={0}>
      <Text>
        {fragment.textFragments.map((tf, i) => (
          <TextFragmentView key={i} fragment={tf} />
        ))}
      </Text>
    </Box>
  );
}
