import type { JSX } from 'react';
import type { BufferFragments } from '../../fragments';
import { LineFragmentView } from './LineFragmentView';
import { TextBlockFragmentView } from './TextBlockFragmentView';

interface FragmentProps {
  fragment: BufferFragments;
}

export function Fragment({ fragment }: FragmentProps): JSX.Element {
  switch (fragment.type) {
    case 'line':
      return <LineFragmentView fragment={fragment} />;
    case 'text-block':
      return <TextBlockFragmentView fragment={fragment} />;
  }
}
