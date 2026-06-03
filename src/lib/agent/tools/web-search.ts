import * as z from 'zod';
import { getTavilyClient } from '../../tavily';
import { createTool } from './common';

const inputSchema = z.object({
  query: z
    .string()
    .describe(
      'The search query to send to the web search engine. For multiple independent' +
        ' searches, invoke this tool multiple times in parallel.'
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe(
      'The maximum number of results to return. Google Custom Search caps a single' +
        ' request at 10. Defaults to 10 when omitted.'
    ),
  country: z
    .string()
    .optional()
    .describe('Optional country in which to query the information for'),
  timeRange: z
    .enum(['year', 'month', 'week', 'day', 'y', 'm', 'w', 'd'] as const)
    .optional()
    .describe(
      'Optional time range in which to search for. Can be useful if the search query is' +
        ' time-specific'
    ),
});

const resultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});
type SearchResult = z.infer<typeof resultSchema>;

const outputSchema = z.object({
  query: z.string(),
  results: z.array(resultSchema),
});

export default createTool({
  internalName: 'web_search',
  name: 'Web Search',
  description:
    'Performs a web search via the Google Custom Search JSON API and returns a list' +
    ' of relevant results containing a title, URL, and a short snippet summarizing' +
    ' the page. Use this tool when the information required to answer the user is' +
    ' not present in the local context, the codebase, or your prior knowledge — for' +
    ' example to look up current events, library documentation, error messages, or' +
    ' external references. Invoke the tool multiple times in parallel when several' +
    ' independent searches are needed. Pair this with a follow-up fetch of a' +
    ' specific URL when deeper inspection of a result is needed. ONLY invoke this' +
    ' tool when the current context is insufficient and the answer genuinely' +
    ' requires up-to-date or external information.',
  inputSchema,
  outputSchema,

  async handle({ query, maxResults, timeRange, country }) {
    const client = getTavilyClient();
    const response = await client.search(query, {
      maxResults,
      timeRange,
      country,
    });

    const results: SearchResult[] = response.results.map(
      (res): SearchResult => ({
        title: res.title,
        url: res.url,
        snippet: res.content,
      })
    );

    return { query, results };
  },

  inputToString({ query, country }) {
    const regionSuffix = country ? ` in \`${country}\`` : '';
    return `Searching the web for \`${query}\`${regionSuffix}`;
  },

  outputToString({ query, results }) {
    if (results.length === 0) {
      return `\`${query}\` returned no results`;
    }
    return `\`${query}\` returned \`${results.length} result${results.length === 1 ? '' : 's'}\``;
  },
});
