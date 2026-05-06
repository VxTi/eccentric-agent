import { z } from 'zod';
import { createTool } from '../tools';

const inputSchema = z.object({
  query: z
    .string()
    .describe('The search query to send to the web search engine'),
  maxResults: z
    .number()
    .optional()
    .describe(
      'The maximum number of results to return. Defaults to 10 when omitted.'
    ),
  region: z
    .string()
    .optional()
    .describe(
      'Optional region/locale code for the search (e.g. `us-en`, `nl-nl`, `wt-wt` for no region).' +
        ' Defaults to `wt-wt` (worldwide) when omitted.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const resultSchema = z.object({
  title: z.string().describe('The title of the search result'),
  url: z.string().describe('The URL of the search result'),
  snippet: z
    .string()
    .describe('A short text snippet summarizing the contents of the result'),
});

const outputSchema = z.object({
  query: z.string().describe('The query that was executed'),
  results: z
    .array(resultSchema)
    .describe('The list of search results returned by the search engine'),
});

type Output = z.infer<typeof outputSchema>;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '')).trim();
}

function resolveDuckDuckGoUrl(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return url.toString();
  } catch {
    return href;
  }
}

async function handler(input: Input): Promise<Output> {
  const limit = input.maxResults ?? 10;
  const region = input.region ?? 'wt-wt';

  const params = new URLSearchParams({
    q: input.query,
    kl: region,
  });

  const response = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Web search failed: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const results: z.infer<typeof resultSchema>[] = [];

  const resultPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  let match: RegExpExecArray | null;
  while (
    (match = resultPattern.exec(html)) !== null &&
    results.length < limit
  ) {
    const url = resolveDuckDuckGoUrl(decodeHtmlEntities(match[1]));
    const title = stripTags(match[2]);
    const snippet = stripTags(match[3]);
    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return { query: input.query, results };
}

export default createTool(
  'web_search',
  'Web search',
  'Performs a web search and returns a list of relevant results, each containing a title, URL, and a short' +
    ' snippet summarizing the page. Use this tool when the information required to answer the user is not' +
    ' present in the local context, the codebase, or your prior knowledge — for example to look up current' +
    ' events, library documentation, error messages, or external references. Pair this with a follow-up' +
    ' fetch of a specific URL when deeper inspection of a result is needed. ONLY invoke this tool when the' +
    ' current context is insufficient and the answer genuinely requires up-to-date or external information.',
  inputSchema,
  outputSchema,
  handler
);
