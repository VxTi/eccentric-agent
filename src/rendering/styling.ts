export type TextColor =
  | 'red'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'cyan'
  | 'magenta'
  | 'white'
  | 'black'
  | 'gray'
  | 'bright-red'
  | 'bright-green'
  | 'bright-blue'
  | 'bright-yellow'
  | 'bright-cyan'
  | 'bright-magenta'
  | 'bright-white';

export const TextColorAnsiMapping: Record<TextColor, string> = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  black: '\x1b[30m',
  gray: '\x1b[90m',
  ['bright-red']: '\x1b[91m',
  ['bright-green']: '\x1b[92m',
  ['bright-blue']: '\x1b[94m',
  ['bright-yellow']: '\x1b[93m',
  ['bright-cyan']: '\x1b[96m',
  ['bright-magenta']: '\x1b[95m',
  ['bright-white']: '\x1b[97m',
};

export type BackgroundColor =
  | 'none'
  | 'red'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'cyan'
  | 'magenta'
  | 'white'
  | 'black'
  | 'gray'
  | 'bright-red'
  | 'bright-green'
  | 'bright-blue'
  | 'bright-yellow'
  | 'bright-cyan'
  | 'bright-magenta'
  | 'bright-white';

export const BackgroundColorAnsiMapping: Record<BackgroundColor, string> = {
  none: '',
  red: '\x1b[41m',
  green: '\x1b[42m',
  blue: '\x1b[44m',
  yellow: '\x1b[43m',
  cyan: '\x1b[46m',
  magenta: '\x1b[45m',
  white: '\x1b[47m',
  black: '\x1b[40m',
  gray: '\x1b[100m',
  ['bright-red']: '\x1b[101m',
  ['bright-green']: '\x1b[102m',
  ['bright-blue']: '\x1b[104m',
  ['bright-yellow']: '\x1b[103m',
  ['bright-cyan']: '\x1b[106m',
  ['bright-magenta']: '\x1b[105m',
  ['bright-white']: '\x1b[107m',
};

export type TextStyle = 'bold' | 'italic' | 'underline' | 'normal';

export const TextStyleAnsiMapping: Record<TextStyle, string> = {
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  normal: '\x1b[0m',
};

export type TextAlignment = 'left' | 'center' | 'right';

export const DEFAULT_TEXT_COLOR: TextColor = 'white';
export const DEFAULT_BACKGROUND_COLOR: BackgroundColor = 'none';
export const DEFAULT_TEXT_STYLE: TextStyle = 'normal';
export const DEFAULT_TEXT_ALIGN: TextAlignment = 'left';
export const RESET_ANSI = '\x1b[0m';
