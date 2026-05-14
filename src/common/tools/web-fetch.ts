import { type Output } from 'ai';
import { z } from 'zod';
import { ToolBase } from '../tools';

export default class WebFetchTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'web_fetch',
      'Web Fetch',
      'Fetches a specific web page over HTTP(S) and returns its raw textual body together with the' +
        ' final URL, HTTP status code, and content type. Use this tool when the user provides a full' +
        ' URL or when a previous `web_search` result needs deeper inspection. The response body is' +
        ' returned verbatim — for HTML pages this means the raw markup, so callers should be prepared' +
        ' to strip tags or extract the relevant section. Use `maxBytes` to cap the size of very large' +
        ' responses. Do NOT use this tool to discover content (use `web_search` for that) or to read' +
        ' local files (use `read_file` for that). ONLY invoke this tool when the URL is known and the' +
        ' page content is not already available in the current context.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(input: Input): Promise<Output> {
    const { urls, maxBytes } = input;

    if (urls.length === 0) {
      throw new Error('List of URLs must be greater than 0 ');
    }

    return await Promise.all(
      urls.map(async url => {
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
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
      })
    );
  }

  public override inputToString(input: Input): string {
    if (input.urls.length === 1) {
      return `Inspecting \`${input.urls[0]}\``;
    }

    return `Inspecting `;
  }

  public override outputToString(output: Output): string {
    if (output.length === 1) {
      const okStatus = Math.floor(output[0].status / 100) === 2;

      if (okStatus) {
        return `Website has been analysed`;
      }

      return `Unable to analyse website`;
    }

    const errStatuses = output.filter(
      ({ status }) => Math.floor(status / 100) === 2
    ).length;

    if (errStatuses === 0) {
      return `All \`${output.length}\` websites have been analysed`;
    }

    if (errStatuses === output.length) {
      return `All of the requests failed`;
    }

    return `\`${output.length - errStatuses}\` / \`${output.length}\` requests were made successfully`;
  }
}

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

type Input = z.infer<typeof inputSchema>;

const outputSchema = z
  .object({
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
  })
  .array();

type Output = z.infer<typeof outputSchema>;
