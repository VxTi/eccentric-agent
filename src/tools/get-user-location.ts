import * as https from 'node:https';
import * as z from 'zod';
import { createTool } from './common';

const inputSchema = z.object();
const outputSchema = z.object({
  city: z.string(),
  region: z.string(),
  country: z.string(),
  countryCode: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  timeZone: z.string(),
});

const GEO_ENDPOINT = 'https://ipwho.is/';

// Node's built-in `fetch` (undici) unconditionally adds `Sec-Fetch-Mode: cors`
// to outgoing requests, which ipwho.is's free plan interprets as a browser
// CORS request and rejects with `{"success":false,"message":"CORS is not
// supported on the Free plan"}`. The header is on undici's forbidden list so
// it can't be overridden from headers. Using `node:https` directly bypasses
// undici and the service responds normally.
function httpsGetJson(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
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
        res.on('data', chunk => chunks.push(chunk as Buffer));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
        res.on('error', reject);
      }
    );
    req.on('error', reject);
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
  // TODO: Reconsider
  mightRequireApproval: false,

  async handle() {
    const { status, body } = await httpsGetJson(GEO_ENDPOINT);

    if (status < 200 || status >= 300) {
      throw new Error(
        `Geolocation lookup failed: HTTP ${status} — ${body.slice(0, 200)}`
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Geolocation lookup returned non-JSON response: ${body.slice(0, 200)}`
      );
    }

    if (data.success === false) {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        `Geolocation lookup failed: ${String(data.message ?? 'unknown reason')}`
      );
    }

    const timezone = data.timezone as Record<string, unknown> | undefined;
    const timeZoneId =
      timezone && typeof timezone.id === 'string' ? timezone.id : '';

    return {
      city: typeof data.city === 'string' ? data.city : '',
      region: typeof data.region === 'string' ? data.region : '',
      country: typeof data.country === 'string' ? data.country : '',
      countryCode:
        typeof data.country_code === 'string' ? data.country_code : '',
      latitude: typeof data.latitude === 'number' ? data.latitude : null,
      longitude: typeof data.longitude === 'number' ? data.longitude : null,
      timeZone: timeZoneId,
    };
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
