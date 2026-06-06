import { tavily, type TavilyClient } from '@tavily/core';
import { config } from 'dotenv';
import { requiredEnv } from '../env';

config({ quiet: true });

let client: TavilyClient | null;

/**
 * @see https://app.tavily.com/home
 */
export function getTavilyClient(): TavilyClient {
  if (!client) {
    client = tavily({ apiKey: requiredEnv('TAVILY_API_KEY') });
  }

  return client;
}
