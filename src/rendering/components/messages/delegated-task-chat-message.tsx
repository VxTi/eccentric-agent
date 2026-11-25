import { isEmptyArray, isNotNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import {
  type DelegatedTaskMessage,
  type DelegatedTaskResult,
  type DelegatedTaskSpec,
} from '../../../lib/types/messages';
import { Spinner } from '../spinner';
import { ChatMessageContent } from './chat-message-content';
import { type BaseProps } from './common';

const PENDING_MARKER = '○';
const SUCCESS_MARKER = '✔';
const FAILURE_MARKER = '✖';

export function DelegatedTaskChatMessage({
  message,
}: BaseProps<DelegatedTaskMessage>) {
  if (isEmptyArray(message.tasks)) return null;

  return (
    <Box flexShrink={0} flexDirection="column">
      <Box flexDirection="row">
        <Spinner loading={message.loading ?? false} />
        <Text bold>Delegated tasks</Text>
      </Box>
      <Box paddingLeft={2}>
        <ChatMessageContent content={message.content} uid={message.id} />
      </Box>
      {message.tasks.map(task => (
        <DelegatedTaskRow
          key={task.name}
          task={task}
          result={message.results?.find(res => res.taskName === task.name)}
        />
      ))}
    </Box>
  );
}

interface DelegatedTaskRowProps {
  task: DelegatedTaskSpec;
  result: DelegatedTaskResult | undefined;
}

function DelegatedTaskRow({ task, result }: DelegatedTaskRowProps) {
  const annotations = formatAnnotations(task);
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box flexDirection="row">
        <StatusMarker succeeded={result?.success} />
        <Text>{task.name}</Text>
        {annotations.map(annotation => (
          <Text key={annotation} color="gray">
            {' '}
            · {annotation}
          </Text>
        ))}
      </Box>
      {result?.success === false ? (
        <Text color="red" wrap="wrap">
          {result.taskResult}
        </Text>
      ) : (
        <Text color="gray" wrap="wrap">
          {task.goal}
        </Text>
      )}
    </Box>
  );
}

function StatusMarker({ succeeded }: { succeeded: boolean | undefined }) {
  if (succeeded === undefined) {
    return <Text color="gray">{PENDING_MARKER} </Text>;
  }

  return succeeded ? (
    <Text color="green">{SUCCESS_MARKER} </Text>
  ) : (
    <Text color="red" bold>
      {FAILURE_MARKER}{' '}
    </Text>
  );
}

function formatAnnotations(task: DelegatedTaskSpec): string[] {
  return [task.complexity, ...formatDependencies(task)]
    .filter((a): a is Exclude<typeof a, undefined> => isNotNil(a))
    .map(String);
}

function formatDependencies(task: DelegatedTaskSpec): string[] {
  if (task.dependsOn === undefined || isEmptyArray(task.dependsOn)) return [];

  return [`after ${task.dependsOn.join(', ')}`];
}
