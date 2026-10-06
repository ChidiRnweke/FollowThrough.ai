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

it('preserves nine selected passages including text beyond twelve thousand characters', () => {
	const selections = Array.from({ length: 9 }, (_, i) => ({
		noteId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
		revision: 1,
		from: 0,
		to: 12001,
		text: 'x'.repeat(12001)
	}));
	const result = submitAgentRunInputSchema.parse({
		requestId: crypto.randomUUID(),
		input: 'Compare these passages',
		selections
	});
	expect(result.selections).toEqual(selections);
});

describe('attached resources on a submission', () => {
	const submit = (contextResources: readonly { kind: string; id: string }[]) =>
		submitAgentRunInputSchema.safeParse({
			requestId: '10000000-0000-4000-8000-000000000004',
			input: 'Explain this',
			contextResources
		});

	it('accepts a widget, a diagram and a file', () => {
		expect(
			submit([
				{ kind: 'widget', id: '10000000-0000-4000-8000-000000000005' },
				{ kind: 'diagram', id: '10000000-0000-4000-8000-000000000006' },
				{ kind: 'attachment', id: '10000000-0000-4000-8000-000000000007' }
			]).success
		).toBe(true);
	});

	it('rejects a resource kind it does not know', () => {
		expect(submit([{ kind: 'todo', id: '10000000-0000-4000-8000-000000000005' }]).success).toBe(
			false
		);
	});
});
