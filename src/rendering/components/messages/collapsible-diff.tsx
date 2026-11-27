import type { DiffMessagePart } from '../../../lib/types/messages';
import { isNotNil } from '@vxti/typed';
import { Box, Text, type DOMElement, measureElement } from 'ink';
import { useMemo, useRef, useState } from 'react';
import { useScrollOffset } from '../../context/scroll-offset-context';
// Direct imports, not the `hooks` barrel: the barrel also pulls in
// `use-agent` → `agent-context` → `lib/agent`, which is circular with
// `lib/state` and breaks when this component is the test's entry point.
import { useMouse } from '../../hooks/use-mouse';
import { isWithinBounds } from '../../hooks/use-pointer-focus';
import { diffLines } from '../../terminal-markdown-renderer/markdown-renderer';

/** Diff rows shown before the hidden tail is collapsed into a hint. */
const COLLAPSED_DIFF_MAX_LINES = 8;
const LEFT_MOUSE_BUTTON = 0;

interface CollapsibleDiffProps {
  part: DiffMessagePart;
  width: number;
}

export interface CollapsedDiffLines {
  visible: string[];
  hiddenCount: number;
}

export function collapseDiffLines(
  lines: string[],
  max: number
): CollapsedDiffLines {
  if (lines.length <= max) return { visible: lines, hiddenCount: 0 };
  return { visible: lines.slice(0, max), hiddenCount: lines.length - max };
}

export function CollapsibleDiff({ part, width }: CollapsibleDiffProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const boundsRef = useRef<DOMElement>(null);
  const scrollOffset = useScrollOffset();

  const [hovering, setHovering] = useState(false);

  const { visible, hiddenCount } = useMemo(() => {
    const visible = diffLines(part, width);
    if (isExpanded) return { visible, hiddenCount: 0 };

    return collapseDiffLines(visible, COLLAPSED_DIFF_MAX_LINES);
  }, [isExpanded, part, width]);
  const footer = diffFooter(isExpanded, hiddenCount);

  useMouse(
    event => {
      if (!boundsRef.current) return;
      const bounds = measureElement(boundsRef.current);
      // `measureElement` reports layout coordinates, which exclude the scroll
      // container's contentOffsetY; mouse events are viewport coordinates.
      const over = isWithinBounds(
        event.x,
        event.y + scrollOffset.current,
        bounds
      );

      if (event.kind === 'move' && hovering !== over && isNotNil(footer)) {
        setHovering(over);
        return;
      }

      if (event.kind !== 'down' || event.button !== LEFT_MOUSE_BUTTON) return;

      if (over) setIsExpanded(expanded => !expanded);
    },
    [hovering, setHovering, setIsExpanded, footer]
  );

  return (
    <Box ref={boundsRef} flexDirection="column" flexShrink={1}>
      {visible.map((line, index) => (
        <Text key={index} wrap="wrap">
          {line}
        </Text>
      ))}
      {isNotNil(footer) && <Text dimColor={hovering}>{footer}</Text>}
    </Box>
  );
}

function diffFooter(
  isExpanded: boolean,
  hiddenCount: number
): string | undefined {
  if (isExpanded) return '(click to collapse)';
  if (hiddenCount === 0) return undefined;
  return `… ${hiddenCount} more lines (click to expand)`;
}
