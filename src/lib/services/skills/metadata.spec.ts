import { expect, it } from 'vitest';
import { SkillMetadataEditingService } from './metadata';

const current = { description: 'Release guidance', triggerHints: ['release'], isEnabled: true };

it('clears all trigger hints when the author submits an empty list', () => {
	expect(
		new SkillMetadataEditingService().edit(current, { triggerHints: [] }).triggerHints
	).toEqual([]);
});

it('preserves trigger hints when an edit changes only the enabled state', () => {
	expect(
		new SkillMetadataEditingService().edit(current, { isEnabled: false }).triggerHints
	).toEqual(['release']);
});

it('accepts a description at the portable limit after trimming its whitespace', () => {
	const description = 'x'.repeat(1024);
	expect(
		new SkillMetadataEditingService().edit(current, { description: `  ${description}  ` })
			.description
	).toBe(description);
});
