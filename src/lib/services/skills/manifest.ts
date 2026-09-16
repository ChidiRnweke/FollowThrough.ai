import { stringify } from 'yaml';
import { SKILL_PORTABLE_LIMITS, SKILL_PORTABLE_NAME, type SkillManifest } from '$lib/models/skills';
import { ValidationError } from '$lib/errors';

/** Stored metadata can be incomplete while a skill is being authored. Portable documents cannot. */
export function validatePortableSkill(manifest: SkillManifest): void {
	if (!SKILL_PORTABLE_NAME.test(manifest.slug) || manifest.slug.length > SKILL_PORTABLE_LIMITS.slug)
		throw new ValidationError('Invalid SKILL.md: use a portable lowercase skill name');
	if (
		!manifest.description.trim() ||
		manifest.description.trim().length > SKILL_PORTABLE_LIMITS.description
	)
		throw new ValidationError(
			'Invalid SKILL.md: a non-empty description of at most 1024 characters is required'
		);
	if (manifest.license !== undefined && !manifest.license.trim())
		throw new ValidationError('Invalid SKILL.md: license must not be empty');
	if (
		manifest.compatibility !== undefined &&
		(!manifest.compatibility.trim() ||
			manifest.compatibility.trim().length > SKILL_PORTABLE_LIMITS.compatibility)
	)
		throw new ValidationError(
			'Invalid SKILL.md: compatibility must contain at most 500 characters'
		);
}

/** Portable text is derived from the current instruction body and metadata, on either side. */
export const serializeSkillManifest = (manifest: SkillManifest): string => {
	validatePortableSkill(manifest);
	const header = stringify(
		{
			name: manifest.slug,
			description: manifest.description.trim(),
			...(manifest.license ? { license: manifest.license.trim() } : {}),
			...(manifest.compatibility ? { compatibility: manifest.compatibility.trim() } : {}),
			metadata: {
				...manifest.metadata,
				...(manifest.allowImplicitInvocation
					? {}
					: { 'followthrough.allow-implicit-invocation': 'false' })
			}
		},
		{ lineWidth: 0 }
	).trimEnd();
	return `---\n${header}\n---\n\n${manifest.instructions.trimEnd()}\n`;
};
