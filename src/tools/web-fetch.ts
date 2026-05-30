import * as z from 'zod';
import { createTool } from './common';

const inputSchema = z.object({
  urls: z
    .string()
    .array()
    .describe(
      'The full URL of the web page to fetch (e.g. `https://example.com/path`). Must include the' +
        ' protocol (`http://` or `https://`). This can be a single one or a list of URLs if the request demands' +
        ' multiple sources'
    ),
  maxBytes: z
    .number()
    .optional()
    .describe(
      'Optional maximum number of bytes to return from all individual response bodies. When omitted, the full' +
        ' body is returned.'
    ),
});

const websiteSchema = z.object({
  url: z
    .string()
    .describe('The URL of the web page that was attempted to fetch'),
  status: z.number().describe('The HTTP status code of the response'),
  contentType: z
    .string()
    .describe(
      'The `Content-Type` header of the response, or an empty string if missing'
    ),
  content: z.string().describe('The textual body of the response'),
});
const outputSchema = z.object({
  websites: z
    .array(websiteSchema)
    .describe('A list of websites that were requested, and their content'),
});

async function makeRequest(
  url: string,
  maxBytes: number | undefined
): Promise<z.infer<typeof websiteSchema>> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol: ${parsed.protocol}. Only http and https are allowed.`
    );
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  const body = await response.text();
  const content =
    typeof maxBytes === 'number' && body.length > maxBytes
      ? body.slice(0, maxBytes)
      : body;

  return {
    url: response.url,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    content,
  };
}

export default createTool({
  internalName: 'web_fetch',
  name: 'Web Fetch',
  description:
    'Fetches a specific web page over HTTP(S) and returns its raw textual body together with the' +
    ' final URL, HTTP status code, and content type. Use this tool when the user provides a full' +
    ' URL or when a previous `web_search` result needs deeper inspection. The response body is' +
    ' returned verbatim — for HTML pages this means the raw markup, so callers should be prepared' +
    ' to strip tags or extract the relevant section. Use `maxBytes` to cap the size of very large' +
    ' responses. Do NOT use this tool to discover content (use `web_search` for that) or to read' +
    ' local files (use `read_file` for that). ONLY invoke this tool when the URL is known and the' +
    ' page content is not already available in the current context.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle(input) {
    const { urls, maxBytes } = input;

    if (urls.length === 0) {
      throw new Error('List of URLs must be greater than 0 ');
    }

    const websites = await Promise.all(
      urls.map(async url => makeRequest(url, maxBytes))
    );

    return { websites };
  },

  inputToString(input): string {
    if (input.urls.length === 1) {
      return `Inspecting \`${input.urls[0]}\``;
    }

    return `Inspecting ${input.urls.length} websites\n${input.urls.map(u => `- ${u}`).join('\n')}`;
  },

  outputToString(output): string {
    const { websites } = output;
    const count = websites.length;

    if (count === 1) {
      const okStatus = Math.floor(websites[0].status / 100) === 2;

      if (okStatus) {
        return `Website has been analysed`;
      }

      return `Unable to analyse website`;
    }

    const errStatuses = websites.filter(
      ({ status }) => Math.floor(status / 100) === 2
    ).length;

    if (errStatuses === 0) {
      return `All \`${count}\` websites have been analysed`;
    }

    if (errStatuses === count) {
      return `All of the requests failed`;
    }

    return `\`${count - errStatuses}\` / \`${count}\` requests were made successfully`;
  },
});
