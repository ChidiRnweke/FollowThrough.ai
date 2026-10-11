import { describe, expect, it } from 'vitest';
import { ContextChipsService } from '$lib/services/chat/chips';
const { contextResourceRefOf, uniqueContextResources } = new ContextChipsService();
import { testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('chat chips as run context', () => {
	it('sends a widget chip as a widget reference', () => {
		expect(contextResourceRefOf({ kind: 'widget', id: testWidgetId(), name: 'Tracker' })).toEqual([
			{ kind: 'widget', id: testWidgetId() }
		]);
	});

	it('leaves a note chip to the note ids', () => {
		expect(contextResourceRefOf({ kind: 'note', id: testNoteId(), name: 'Plan' })).toEqual([]);
	});

	it('sends a resource attached twice once', () => {
		expect(
			uniqueContextResources([
				{ kind: 'widget', id: testWidgetId() },
				{ kind: 'widget', id: testWidgetId() }
			])
		).toHaveLength(1);
	});
});
