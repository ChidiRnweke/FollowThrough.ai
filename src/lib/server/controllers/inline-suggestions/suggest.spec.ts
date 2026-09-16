import { describe, expect, it } from 'vitest';
import type { InlineSuggestionRequest } from '$lib/models/agent';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';

const actor = testActor();
const request = (overrides: Partial<InlineSuggestionRequest> = {}): InlineSuggestionRequest => ({
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: testNoteId(),
	projectId: testProjectId(2),
	revision: 2,
	blockType: 'paragraph',
	headingPath: ['Migration'],
	currentSection: 'The migration plan accounts for the cutover',
	prefix: 'The migration plan accounts for the cutover',
	suffix: '',
	...overrides
});
const setup = () => {
	const fixture = inlineSuggestionFixture();
	fixture.notes.notes = [noteBuilder({ title: 'Migration', plainText: 'Saved note text' })];
	return fixture;
};
const signal = () => new AbortController().signal;

describe('direct inline completion', () => {
	it('returns nothing when the passage is too short', async () => {
		expect(await setup().controller.suggest(actor, request({ prefix: 'Hi' }), signal())).toEqual({
			outcome: 'no_suggestion',
			reason: 'ineligible'
		});
	});
	it('returns completion text when project retrieval is empty', async () => {
		expect(await setup().controller.suggest(actor, request(), signal())).toEqual({
			outcome: 'suggested',
			text: ' window.',
			grounding: { currentNote: true, userMemoryCount: 0, projectPassageCount: 0 }
		});
	});
	it('reports retrieved project passages in the result', async () => {
		const fixture = setup();
		fixture.search.documents = [
			{
				userId: actor.userId,
				document: searchDocumentBuilder({ content: 'Ana owns the cutover.' })
			}
		];
		expect(await fixture.controller.suggest(actor, request(), signal())).toMatchObject({
			grounding: { projectPassageCount: 1 }
		});
	});
	it('uses the authoritative note project rather than the request project', async () => {
		const fixture = setup();
		fixture.search.documents = [
			{
				userId: actor.userId,
				document: searchDocumentBuilder({ content: 'Authoritative project' })
			},
			{
				userId: actor.userId,
				document: searchDocumentBuilder({ projectId: testProjectId(2), content: 'Wrong project' })
			}
		];
		await fixture.controller.suggest(actor, request(), signal());
		expect(
			fixture.generator.contexts[0]?.projectPassages.map((passage) => passage.content)
		).toEqual(['Authoritative project']);
	});
	it('provides the authoritative full note to completion', async () => {
		const fixture = setup();
		await fixture.controller.suggest(actor, request(), signal());
		expect(fixture.generator.contexts[0]?.noteText).toBe('Saved note text');
	});
	it('returns nothing when inline completion is disabled', async () => {
		const fixture = setup();
		await fixture.preferences.update(actor, { inlineSuggestionsEnabled: false });
		expect(await fixture.controller.suggest(actor, request(), signal())).toEqual({
			outcome: 'no_suggestion',
			reason: 'ineligible'
		});
	});
	it('returns nothing for an archived note', async () => {
		const fixture = setup();
		fixture.notes.notes = [noteBuilder({ archivedAt: testNow })];
		expect(await fixture.controller.suggest(actor, request(), signal())).toEqual({
			outcome: 'no_suggestion',
			reason: 'ineligible'
		});
	});
	it('refuses a second completion while one is admitted', async () => {
		const fixture = setup();
		fixture.admission.admit(actor.userId);
		expect(await fixture.controller.suggest(actor, request(), signal())).toEqual({
			outcome: 'busy',
			retryAfterMs: 250
		});
	});
	it('allows retry after completion fails', async () => {
		const fixture = setup();
		fixture.generator.failure = new Error('provider down');
		try {
			await fixture.controller.suggest(actor, request(), signal());
		} catch {
			/* Retry verifies admission was released. */
		}
		fixture.generator.failure = undefined;
		expect((await fixture.controller.suggest(actor, request(), signal())).outcome).toBe(
			'suggested'
		);
	});
	it('allows retry after retrieval aborts', async () => {
		const fixture = setup();
		fixture.embeddings.failure = new DOMException('stale caret', 'AbortError');
		try {
			await fixture.controller.suggest(actor, request(), signal());
		} catch {
			/* The next request must be admitted. */
		}
		fixture.embeddings.failure = undefined;
		expect((await fixture.controller.suggest(actor, request(), signal())).outcome).toBe(
			'suggested'
		);
	});
	it('reports retrieval failure instead of inventing empty grounding', async () => {
		const fixture = setup();
		fixture.embeddings.failure = new Error('embedding unavailable');
		await expect(fixture.controller.suggest(actor, request(), signal())).rejects.toThrow(
			'embedding unavailable'
		);
	});
});
