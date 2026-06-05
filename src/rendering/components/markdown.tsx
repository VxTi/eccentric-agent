import { highlight } from 'cli-highlight';
import { Box, Text, type TextProps } from 'ink';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { theme } from '../highlight-theme';

function TextFrag({ children, ...props }: TextProps) {
  if (Array.isArray(children)) {
    return children.map(element => <TextFrag {...props}>{element}</TextFrag>);
  }

  if (typeof children !== 'string') return;

  return <Text {...props}>{children}</Text>;
}

const components: Components = {
  table: ({ children }) => (
    <Box borderStyle="single" borderColor="gray">
      {children}
    </Box>
  ),
  sup: ({ children }) => <TextFrag italic>{children}</TextFrag>,
  th: ({ children }) => (
    <Box
      borderBottom
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      borderColor="gray"
    >
      {children}
    </Box>
  ),
  td: ({ children }) => (
    <Box
      borderBottom
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      borderColor="gray"
    >
      {children}
    </Box>
  ),
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || '');
    const content = typeof children === 'string' ? children : '';

    const formatted = useMemo(() => {
      return highlight(content, {
        language: 'json',
        ignoreIllegals: true,
        theme,
      });
    }, [content]);

    if (match) {
      return <TextFrag>{formatted}</TextFrag>;
    }

    return <TextFrag>{children}</TextFrag>;
  },
  b: ({ children }) => <TextFrag bold>{children}</TextFrag>,
  h1: ({ children }) => <TextFrag bold>{children}</TextFrag>,
  p: ({ children }) => <TextFrag>{children}</TextFrag>,
  span: ({ children }) => <TextFrag>{children}</TextFrag>,
};

const Markdown = memo(({ content }: { content: string }) => {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
});

export default Markdown;
