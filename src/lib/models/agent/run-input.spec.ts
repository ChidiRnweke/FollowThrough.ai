import { describe, expect, it } from 'vitest';
import { submitAgentRunInputSchema } from './index';

describe('agent run input', () => {
	it('rejects a submission with an impossible client time zone', () => {
		expect(() =>
			submitAgentRunInputSchema.parse({
				requestId: '10000000-0000-4000-8000-000000000003',
				input: 'Hello',
				appContext: {
					version: 1,
					capturedAt: '2026-08-24T12:00:00.000Z',
					client: {
						locale: 'en-BE',
						timeZone: 'Mars/Olympus',
						localDate: '2026-08-24',
						layout: 'wide'
					},
					surface: { kind: 'today', presentation: 'full_page' },
					recentInteractions: []
				}
			})
		).toThrow('Client timeZone must be a valid IANA time zone');
	});
});
