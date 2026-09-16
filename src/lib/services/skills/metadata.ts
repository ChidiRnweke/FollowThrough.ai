import type { Skill, SkillEditInput } from '$lib/models/skills';
/** Metadata edits do not change the instruction document or its revision. */
export function applySkillMetadataEdit(
	current: Pick<Skill<never>, 'description' | 'triggerHints' | 'isEnabled'>,
	input: Pick<SkillEditInput, 'description' | 'triggerHints' | 'isEnabled'>
) {
	return {
		description: input.description?.trim() || current.description,
		triggerHints: input.triggerHints
			? input.triggerHints.map((hint) => hint.trim()).filter(Boolean)
			: [...current.triggerHints],
		isEnabled: input.isEnabled ?? current.isEnabled
	};
}
