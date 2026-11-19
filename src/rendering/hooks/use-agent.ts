import { useContext } from 'react';
import {
  AgentContext,
  type AgentContextInstance,
} from '../context/agent-context';

export function useAgent(): AgentContextInstance {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
