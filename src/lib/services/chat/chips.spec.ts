import { describe, expect, it } from 'vitest';
import { ChatChipService } from './chips';
const chips = new ChatChipService();
import { testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('chat chips as run context', () => {
	it('sends a widget chip as a widget reference', () => {
		expect(chips.resources({ kind: 'widget', id: testWidgetId(), name: 'Tracker' })).toEqual([
			{ kind: 'widget', id: testWidgetId() }
		]);
	});

	it('leaves a note chip to the note ids', () => {
		expect(chips.resources({ kind: 'note', id: testNoteId(), name: 'Plan' })).toEqual([]);
	});

	it('sends a resource attached twice once', () => {
		expect(
			chips.unique([
				{ kind: 'widget', id: testWidgetId() },
				{ kind: 'widget', id: testWidgetId() }
			])
		).toHaveLength(1);
	});
});
