import { expect, it } from 'vitest';
import { assembleSuggestionView } from './presentation';
import {
	noteBuilder,
	memorySuggestionBuilder,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it('includes only the note identity and title needed by the review view', () => {
	const note = noteBuilder();
	const view = assembleSuggestionView(memorySuggestionBuilder(), {
		note,
		origin: { pipeline: 'memory', createdAt: testNow }
	});
	expect(view.note).toEqual({ id: note.id, title: note.title });
});

it('renders a standalone proposal without fabricating a source note or anchor', () => {
	const suggestion = memorySuggestionBuilder();
	const origin = { pipeline: 'memory' as const, createdAt: testNow };
	expect(assembleSuggestionView(suggestion, { origin })).toEqual({ suggestion, origin });
});
