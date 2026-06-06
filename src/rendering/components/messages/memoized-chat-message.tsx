import { memo } from 'react';
import { type Message } from '../../../lib/types/messages';
import { ChatMessage } from './chat-message';
import { type CommonProps } from './common';

export const MemoizedChatMessage = memo<CommonProps<Message>>(ChatMessage);
