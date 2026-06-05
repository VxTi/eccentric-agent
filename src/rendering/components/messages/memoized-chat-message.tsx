import { memo } from 'react';
import { ChatMessage, type ChatMessageProps } from './chat-message';

export const MemoizedChatMessage = memo<ChatMessageProps>(ChatMessage);
