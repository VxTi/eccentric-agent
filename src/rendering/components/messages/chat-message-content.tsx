import { Box, Text } from 'ink';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';

interface MarkdownViewProps {
  content: string;
}

export function ChatMessageContent({ content }: MarkdownViewProps) {
  const parsedContent = parseMarkdown(content.trim()).trim();
  if (!parsedContent) {
    return;
  }
  const lines: string[] = parsedContent
    .split('\n')
    .map(line => line.trim() || ' ');

  return (
    <Box flexDirection="column" width="100%">
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}
