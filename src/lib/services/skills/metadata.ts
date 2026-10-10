import {
	SKILL_PORTABLE_LIMITS,
	type Skill,
	type SkillEditInput,
	type SkillMetadataUpdate
} from '$lib/models/skills';
import { ValidationError } from '$lib/errors';
/** Metadata edits do not change the instruction document or its revision. */
function applySkillMetadataEdit(
	current: Pick<Skill<never>, 'description' | 'triggerHints' | 'isEnabled'>,
	input: Pick<SkillEditInput, 'description' | 'triggerHints' | 'isEnabled'>
) {
	const description = input.description?.trim();
	if (description !== undefined && description.length > SKILL_PORTABLE_LIMITS.description)
		throw new ValidationError(
			`Skill description is too long (maximum ${SKILL_PORTABLE_LIMITS.description} characters)`
		);
	return {
		description: description || current.description,
		triggerHints: input.triggerHints
			? input.triggerHints.map((hint) => hint.trim()).filter(Boolean)
			: [...current.triggerHints],
		isEnabled: input.isEnabled ?? current.isEnabled
	};
}

export interface SkillMetadataEditing {
	edit(
		current: Pick<Skill<never>, 'description' | 'triggerHints' | 'isEnabled'>,
		input: Pick<SkillEditInput, 'description' | 'triggerHints' | 'isEnabled'>
	): SkillMetadataUpdate;
}
export class SkillMetadataEditingService implements SkillMetadataEditing {
	edit(
		current: Pick<Skill<never>, 'description' | 'triggerHints' | 'isEnabled'>,
		input: Pick<SkillEditInput, 'description' | 'triggerHints' | 'isEnabled'>
	): SkillMetadataUpdate {
		return applySkillMetadataEdit(current, input);
	}
}
