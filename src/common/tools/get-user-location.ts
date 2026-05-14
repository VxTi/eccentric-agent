import { z } from 'zod';
import { ToolBase } from '../tools';

const GEO_ENDPOINT = 'https://ipwho.is/';

export default class GetUserLocationTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'get_user_location',
      'Get user location',
      "Returns the user's approximate geographic location, derived from their public IP address via" +
        ' a free IP-geolocation service. The result includes city, region, country, the resolved' +
        ' latitude/longitude, and the IANA time zone. Accuracy is at city level at best — do NOT use' +
        ' this for navigation or anything safety-critical. Use this tool when you need rough locale' +
        ' context, e.g. to localize a recommendation, infer business hours, or interpret a relative' +
        " reference like 'nearby'. Takes no arguments.",
      inputSchema,
      outputSchema
    );
  }

  public override async handle(): Promise<Output> {
    const response = await fetch(GEO_ENDPOINT, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(
        `Geolocation lookup failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (data.success === false) {
      throw new Error(
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
  }

  public override inputToString(_input: Input): string {
    return 'Looking up user location';
  }

  public override outputToString(output: Output): string {
    const parts = [output.city, output.region, output.country].filter(
      part => part.length > 0
    );
    if (parts.length === 0) return 'Location unavailable';
    return `User location: ${parts.join(', ')}`;
  }
}

const inputSchema = z.object({});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  city: z.string().describe('The user\'s approximate city, or empty if unknown.'),
  region: z
    .string()
    .describe('The user\'s state, province, or region, or empty if unknown.'),
  country: z
    .string()
    .describe('The full name of the user\'s country, or empty if unknown.'),
  countryCode: z
    .string()
    .describe('The ISO 3166-1 alpha-2 country code, or empty if unknown.'),
  latitude: z
    .number()
    .nullable()
    .describe('Approximate latitude in decimal degrees, or null if unknown.'),
  longitude: z
    .number()
    .nullable()
    .describe('Approximate longitude in decimal degrees, or null if unknown.'),
  timeZone: z
    .string()
    .describe('The IANA time zone for the location, or empty if unknown.'),
});

type Output = z.infer<typeof outputSchema>;
