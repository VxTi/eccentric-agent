import * as cheerio from 'cheerio';
import * as z from 'zod';
import { createTool } from './common';

const LANGUAGE_CODE_ALL = 'all';
const enum SafeSearch {
  DISABLED = '0',
  MODERATE = '1',
  STRICT = '2',
}

const inputSchema = z.object({
  query: z
    .string()
    .describe(
      'The search queries to send to the web search engine. This can be a single query or a list of queries if the' +
        ' request demands multiple independent searches; they will be executed in parallel.'
    ),
  maxResults: z
    .number()
    .optional()
    .describe(
      'The maximum number of results to return per query. Defaults to 10 when omitted.'
    ),
  region: z
    .string()
    .optional()
    .describe(
      `Optional region/locale code applied to all queries (e.g. \`us-en\`, \`nl-nl\`, \`${LANGUAGE_CODE_ALL}\` for no region).` +
        ' Defaults to `wt-wt` (worldwide) when omitted.'
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

function getCountryName(locale: string): string | undefined {
  const countryCode = locale.split('-')[1].toUpperCase();
  return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode);
}

function extractSearchResults(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('div#urls>article').each((_, article) => {
    if (results.length >= limit) return false;

    const anchor = $(article).find('h3>a').first();
    const title = anchor.text().trim();
    const href = anchor.attr('href');
    if (!title || !href) return;

    const snippet = $(article).find('p').first().text().trim();
    results.push({
      title,
      url: resolveDuckDuckGoUrl(href),
      snippet,
    });
  });

  return results;
}

async function makeRequest(
  query: string,
  regionCode: string,
  limit: number
): Promise<{ query: string; results: SearchResult[] }> {
  const params = new URLSearchParams({
    q: query,
    kl: regionCode,
    language: regionCode,
    safesearch: SafeSearch.STRICT,
    categories: 'general',
    time_range: '',
  });

  const response = await fetch(`https://opnxng.com/search?${params}`, {
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
  const rawHtml = await response.text();
  const results: SearchResult[] = extractSearchResults(rawHtml, limit);

  return { query, results };
}

export default createTool({
  internalName: 'web_search',
  name: 'Web Search',
  description:
    'Performs one or more web searches in parallel and returns, for each query, a list of relevant results' +
    ' containing a title, URL, and a short snippet summarizing the page. Use this tool when the information' +
    ' required to answer the user is not present in the local context, the codebase, or your prior knowledge' +
    ' — for example to look up current events, library documentation, error messages, or external references.' +
    ' Provide multiple queries at once when several independent searches are needed; they will be executed' +
    ' concurrently. Pair this with a follow-up fetch of a specific URL when deeper inspection of a result is' +
    ' needed. ONLY invoke this tool when the current context is insufficient and the answer genuinely requires' +
    ' up-to-date or external information.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle({ query, maxResults, region }) {
    const limit = maxResults ?? 10;
    const regionCode = region ?? 'all';

    return await makeRequest(query, regionCode, limit);
  },

  inputToString({ query, region }) {
    const regionSuffix =
      !region || region === 'wt-wt'
        ? ''
        : ` in region \`${getCountryName(region)}\``;

    return `Searching the web for \`${query}\`${regionSuffix}`;
  },

  outputToString({ query, results }) {
    if (results.length === 0) {
      return `\`${query}\` returned no results`;
    }
    return `\`${query}\` returned \`${results.length} result${results.length === 1 ? '' : 's'}\``;
  },
});
