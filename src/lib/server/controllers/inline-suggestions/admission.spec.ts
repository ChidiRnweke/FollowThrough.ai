import { describe, expect, it } from 'vitest';
import type { InlineSuggestionRequest } from '$lib/models/agent';
import { InlineAdmissionService } from '$lib/server/services/inline-suggestions/inline-admission';
import { InMemoryInlineAttempts } from '$lib/testing/inline-suggestions/fakes/inline-attempts';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const request: InlineSuggestionRequest = {
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: testNoteId(),
	projectId: testProjectId(2),
	revision: 2,
	blockType: 'paragraph',
	headingPath: ['Migration'],
	currentSection: 'The migration plan accounts for the cutover',
	prefix: 'The migration plan accounts for the cutover',
	suffix: ''
};
const signal = () => new AbortController().signal;

/** One completion per minute, on a clock the test moves. */
const setup = () => {
	const clock = { now: Date.parse('2026-07-12T08:00:00.000Z') };
	const fixture = inlineSuggestionFixture({
		admission: new InlineAdmissionService(new InMemoryInlineAttempts(), 1),
		now: () => clock.now
	});
	fixture.notes.notes = [noteBuilder({ title: 'Migration', plainText: 'Saved note text' })];
	return { ...fixture, clock };
};

describe('inline suggestion admission', () => {
	it('refuses a completion past the per-minute budget', async () => {
		const fixture = setup();
		await fixture.controller.suggest(testActor(), request, signal());
		expect(await fixture.controller.suggest(testActor(), request, signal())).toEqual({
			outcome: 'rate_limited',
			retryAfterMs: 60_000
		});
	});

	it('admits again after the budget window rolls over', async () => {
		const fixture = setup();
		await fixture.controller.suggest(testActor(), request, signal());
		fixture.clock.now += 60_001;
		expect((await fixture.controller.suggest(testActor(), request, signal())).outcome).toBe(
			'suggested'
		);
	});

	it('keeps each user on their own budget', async () => {
		const fixture = setup();
		await fixture.controller.suggest(testActor(), request, signal());
		fixture.notes.notes = [
			noteBuilder({ title: 'Migration', plainText: 'Saved note text', userId: testActor(2).userId })
		];
		expect((await fixture.controller.suggest(testActor(2), request, signal())).outcome).toBe(
			'suggested'
		);
	});
});
