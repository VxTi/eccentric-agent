import { type Output } from 'ai';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { ToolBase } from '../tools';

export default class WebSearchTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'web_search',
      'Web Search',
      'Performs a web search and returns a list of relevant results, each containing a title, URL, and a short' +
        ' snippet summarizing the page. Use this tool when the information required to answer the user is not' +
        ' present in the local context, the codebase, or your prior knowledge — for example to look up current' +
        ' events, library documentation, error messages, or external references. Pair this with a follow-up' +
        ' fetch of a specific URL when deeper inspection of a result is needed. ONLY invoke this tool when the' +
        ' current context is insufficient and the answer genuinely requires up-to-date or external information.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(input: Input): Promise<Output> {
    const limit = input.maxResults ?? 10;
    const region = input.region ?? 'wt-wt';

    const params = new URLSearchParams({
      q: input.query,
      kl: region,
    });

    const response = await fetch(
      `https://html.duckduckgo.com/html/?${params}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Web search failed: ${response.status} ${response.statusText}`
      );
    }
    const rawHtml = await response.text();
    const $ = cheerio.load(rawHtml);
    const results: z.infer<typeof resultSchema>[] = [];

    $('div.result').each((_, el) => {
      if (results.length >= limit) return false;

      const anchor = $(el).find('a.result__a').first();
      const title = anchor.text().trim();
      const href = anchor.attr('href');
      if (!title || !href) return;

      const snippet = $(el).find('.result__snippet').first().text().trim();
      results.push({
        title,
        url: this.resolveDuckDuckGoUrl(href),
        snippet,
      });
    });

    return { query: input.query, results };
  }

  private resolveDuckDuckGoUrl(href: string): string {
    try {
      const url = new URL(href, 'https://duckduckgo.com');
      const uddg = url.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
      return url.toString();
    } catch {
      return href;
    }
  }

  public override inputToString(input: Input): string {
    return `Searching the web for \`${input.query}\`${!input.region || input.region === 'wt-wt' ? '' : `in region \`${input.region}\``}`;
  }

  public override outputToString(output: Output): string {
    const { query, results } = output;

    return `\`${query}\` returned \`${results.length} result${results.length > 1 ? 's' : ''}\``;
  }
}

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
