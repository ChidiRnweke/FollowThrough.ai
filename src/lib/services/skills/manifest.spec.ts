import { expect, it } from 'vitest';
import { serializeSkillManifest } from './manifest';
import type { SkillManifest } from '$lib/models/skills';

const manifest: SkillManifest = {
	slug: 'review-notes',
	description: 'Review notes',
	metadata: {},
	allowImplicitInvocation: true,
	instructions: 'Read the note.'
};

it.each([
	{ slug: 'Bad Name' },
	{ slug: 'a'.repeat(65) },
	{ description: ' ' },
	{ description: 'a'.repeat(1025) },
	{ license: ' ' },
	{ compatibility: ' ' },
	{ compatibility: 'a'.repeat(501) }
])('rejects metadata that cannot be exported as portable SKILL.md: %j', (patch) => {
	expect(() => serializeSkillManifest({ ...manifest, ...patch })).toThrow('Invalid SKILL.md');
});
