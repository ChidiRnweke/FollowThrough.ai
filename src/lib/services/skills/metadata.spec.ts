import { expect, it } from 'vitest';
import { applySkillMetadataEdit } from './metadata';

const current = { description: 'Release guidance', triggerHints: ['release'], isEnabled: true };

it('clears all trigger hints when the author submits an empty list', () => {
	expect(applySkillMetadataEdit(current, { triggerHints: [] }).triggerHints).toEqual([]);
});

it('preserves trigger hints when an edit changes only the enabled state', () => {
	expect(applySkillMetadataEdit(current, { isEnabled: false }).triggerHints).toEqual(['release']);
});
