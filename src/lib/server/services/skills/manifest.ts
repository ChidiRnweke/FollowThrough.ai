import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { SkillManifest } from '$lib/models/skills';
import { ValidationError } from '$lib/errors';

const slug = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens');

const frontmatterSchema = z.object({
	name: slug,
	description: z.string().trim().min(1).max(1024),
	license: z.string().trim().min(1).optional(),
	compatibility: z.string().trim().min(1).max(500).optional(),
	metadata: z.record(z.string(), z.string()).optional()
});

const IMPLICIT_KEY = 'followthrough.allow-implicit-invocation';

export class SkillManifestCodec {
	parse(source: string): SkillManifest {
		const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
		if (!match) throw new ValidationError('SKILL.md must start with YAML frontmatter delimiters');
		try {
			const value = frontmatterSchema.parse(parse(match[1] ?? ''));
			const metadata = { ...(value.metadata ?? {}) };
			const implicit = metadata[IMPLICIT_KEY] !== 'false';
			delete metadata[IMPLICIT_KEY];
			return {
				slug: value.name,
				description: value.description,
				...(value.license ? { license: value.license } : {}),
				...(value.compatibility ? { compatibility: value.compatibility } : {}),
				metadata,
				allowImplicitInvocation: implicit,
				instructions: (match[2] ?? '').replace(/^\r?\n/, '').trimEnd()
			};
		} catch (error) {
			throw new ValidationError(
				error instanceof Error ? `Invalid SKILL.md: ${error.message}` : 'Invalid SKILL.md'
			);
		}
	}

	serialize(manifest: SkillManifest): string {
		const validated = frontmatterSchema.parse({
			name: manifest.slug,
			description: manifest.description,
			license: manifest.license,
			compatibility: manifest.compatibility,
			metadata: {
				...manifest.metadata,
				...(manifest.allowImplicitInvocation ? {} : { [IMPLICIT_KEY]: 'false' })
			}
		});
		const header = stringify(validated, { lineWidth: 0 }).trimEnd();
		return `---\n${header}\n---\n\n${manifest.instructions.trimEnd()}\n`;
	}
}

export const validateAttachmentPath = (value: string): string => {
	const path = value.trim();
	if (
		!path ||
		path === 'SKILL.md' ||
		path.startsWith('/') ||
		path.includes('\\') ||
		path.split('/').some((part) => !part || part === '.' || part === '..')
	)
		throw new ValidationError('Attachment path must be a safe relative path outside SKILL.md');
	if (path.length > 512) throw new ValidationError('Attachment path is too long');
	return path;
};
