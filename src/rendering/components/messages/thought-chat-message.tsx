import chalk from 'chalk';
import { Text, useAnimation } from 'ink';
import { type ThoughtMessage } from '../../../lib/types/messages';
import { type BaseProps } from './common';

const ANIMATION_INTERVAL_MS = 120;
const MIN_BRIGHTNESS = 90;
const MAX_BRIGHTNESS = 255;
const WAVE_COUNT = 1;

function characterBrightness(
  charIndex: number,
  offset: number,
  length: number
): number {
  const wavelength = Math.max(length / WAVE_COUNT, 1);
  const phase = ((charIndex - offset) / wavelength) * Math.PI * 2;
  const brightness = (Math.sin(phase) + 1) / 2;
  return Math.round(
    MIN_BRIGHTNESS + brightness * (MAX_BRIGHTNESS - MIN_BRIGHTNESS)
  );
}

function shadedText(text: string, offset: number): string {
  return Array.from(text)
    .map((char, index) => {
      const level = characterBrightness(index, offset, text.length);
      return chalk.rgb(level, level, level)(char);
    })
    .join('');
}

export function ThoughtChatMessage({ message }: BaseProps<ThoughtMessage>) {
  const loading = message.loading ?? false;
  const { frame } = useAnimation({
    interval: ANIMATION_INTERVAL_MS,
    isActive: loading,
  });

  if (loading) {
    return <Text>{shadedText(message.content, frame)}</Text>;
  }

  return <Text color="gray">{message.content}</Text>;
}
