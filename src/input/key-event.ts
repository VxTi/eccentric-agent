export const enum KeyType {
  TAB = 'tab',
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
  ESCAPE = 'escape',
  HOME = 'home',
  END = 'end',
  RETURN = 'return',
  BACKSPACE = 'backspace',
  KEY_C = 'c',
}

export interface KeyEvent {
  meta: string;
  ctrl: string;
  name: KeyType;
}
