import { tavily, type TavilyClient } from '@tavily/core';

let client: TavilyClient | undefined;

/**
 * @see https://app.tavily.com/home
 */
export function getTavilyClient(): TavilyClient {
  if (!client) {
    client = tavily({ apiKey: requiredEnv('TAVILY_API_KEY') });
  }

  return client;
}
