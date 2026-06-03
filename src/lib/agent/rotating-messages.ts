export const AGENT_PROCESSING_MESSAGES: readonly string[] = [
  'Reticulating...',
  'Panic!',
  'Caffeinating...',
  'Hamsters sprinting...',
  'Mathing...',
  'Negotiating...',
  'Whispering...',
  'Shoveling data...',
  'Staring blankly...',
  'Sweating...',
  'Consulting oracle...',
  'Crunching...',
  'Pondering...',
  'Bribing servers...',
  'Simulating progress...',
  'Buffering intensely...',
  'Squinting...',
  'Inhaling...',
  'Assembling...',
  'Plotting...',
];

export function getRandomMessage(): string {
  return AGENT_PROCESSING_MESSAGES[
    Math.floor(Math.random() * AGENT_PROCESSING_MESSAGES.length)
  ];
}
