import { memo } from 'react';
import { type Message } from '../../../lib/types/messages';
import { ChatMessage } from './chat-message';
import { type BaseProps } from './common';

export const MemoizedChatMessage = memo<BaseProps<Message>>(ChatMessage);
