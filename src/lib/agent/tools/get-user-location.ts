import * as https from 'node:https';
import * as z from 'zod';
import { Result } from '../../result';
import { createTool } from './common';

const geoSuccessResponseDecoder = z.object({
  success: z.literal(true),
  ip: z.string(),
  continent: z.string(),
  country: z.string(),
  continent_code: z.string(),
  region: z.string(),
  region_code: z.string(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});
const geoFailureResponseDecoder = z.object({
  success: z.literal(false),
  message: z.string(),
});
const geoResponseDecoder = z.discriminatedUnion('success', [
  geoSuccessResponseDecoder,
  geoFailureResponseDecoder,
]);
type GeoData = z.infer<typeof geoResponseDecoder>;

const inputSchema = z.object();
const outputSchema = geoSuccessResponseDecoder;

const GEO_ENDPOINT = 'https://ipwho.is/';

// Node's built-in `fetch` (undici) unconditionally adds `Sec-Fetch-Mode: cors`
// to outgoing requests, which ipwho.is's free plan interprets as a browser
// CORS request and rejects with `{"success":false,"message":"CORS is not
// supported on the Free plan"}`. The header is on undici's forbidden list so
// it can't be overridden from headers. Using `node:https` directly bypasses
// undici and the service responds normally.
function httpsGetJson(
  url: string
): Promise<Result<{ status: number; body: GeoData }>> {
  return new Promise(resolve => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'eccentric-agent/1.0 (+server-side)',
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const bodyData = Buffer.concat(chunks).toString('utf8');
          const bodyResult = geoResponseDecoder.safeParse(JSON.parse(bodyData));

          // Parsing errors
          if (!bodyResult.success) {
            return resolve(Result.Error(bodyResult.error.message));
          }

          // Server errors
          if (!bodyResult.data.success) {
            return resolve(Result.Error(bodyResult.data.message));
          }

          resolve(
            Result.Ok({
              status: res.statusCode ?? 0,
              body: bodyResult.data,
            })
          );
        });
        res.on('error', err => resolve(Result.Error(err.message)));
      }
    );
    req.on('error', err => resolve(Result.Error(err.message)));
    req.end();
  });
}

export default createTool({
  internalName: 'get_user_location',
  name: 'Get user location',
  description:
    "Returns the user's approximate geographic location, derived from their public IP address via" +
    ' a free IP-geolocation service. The result includes city, region, country, the resolved' +
    ' latitude/longitude, and the IANA time zone. Accuracy is at city level at best — do NOT use' +
    ' this for navigation or anything safety-critical. Use this tool when you need rough locale' +
    ' context, e.g. to localize a recommendation, infer business hours, or interpret a relative' +
    " reference like 'nearby'. Takes no arguments.",
  inputSchema,
  outputSchema,

  async handle() {
    const result = await httpsGetJson(GEO_ENDPOINT);

    if (!result.ok) return result;

    if (!result.data.body.success) {
      return Result.Error(
        `Geolocation lookup failed: HTTP ${result.data.status} - ${result.data.body.message}`
      );
    }

    return Result.Ok(result.data.body);
  },

  inputToString() {
    return 'Looking up user location';
  },

  outputToString({ city, region, country }) {
    const parts = [city, region, country].filter(part => part.length > 0);

    if (parts.length === 0) return 'Location unavailable';

    return `User location: ${parts.map(p => `\`${p}\``).join(', ')}`;
  },
});
