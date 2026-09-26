import { parse } from 'yaml';
import { skillFrontmatterSchema, type SkillManifest } from '$lib/models/skills';
import { ValidationError } from '$lib/errors';

export function readSkillManifest(source: string): SkillManifest {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
	if (!match) throw new ValidationError('SKILL.md must start with YAML frontmatter delimiters');
	try {
		const value = skillFrontmatterSchema.parse(parse(match[1]));
		const metadata = { ...(value.metadata ?? {}) };
		const allowImplicitInvocation = metadata['followthrough.allow-implicit-invocation'] !== 'false';
		delete metadata['followthrough.allow-implicit-invocation'];
		return {
			slug: value.name,
			description: value.description,
			...(value.license ? { license: value.license } : {}),
			...(value.compatibility ? { compatibility: value.compatibility } : {}),
			metadata,
			allowImplicitInvocation,
			instructions: match[2].replace(/^\r?\n/, '').trimEnd()
		};
	} catch (error) {
		throw new ValidationError(
			error instanceof Error ? `Invalid SKILL.md: ${error.message}` : 'Invalid SKILL.md'
		);
	}
}
