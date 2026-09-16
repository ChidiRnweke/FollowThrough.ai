import { expect, it } from 'vitest';
import { readSkillManifest } from './manifest-reader.server';
import { serializeSkillManifest } from '$lib/services/skills/manifest';

it('round-trips the exported Agent Skills document through the import boundary', () => {
	const manifest = {
		slug: 'review-notes',
		description: 'Review a note for unresolved decisions.',
		license: 'MIT',
		compatibility: 'Requires note read access.',
		metadata: { owner: 'product' },
		allowImplicitInvocation: false,
		instructions: '# Workflow\n\nRead the note before proposing changes.'
	};
	expect(readSkillManifest(serializeSkillManifest(manifest))).toEqual(manifest);
});

it('rejects non-portable skill names before they reach a controller', () => {
	expect(() => readSkillManifest('---\nname: Bad Name\ndescription: Test\n---\nBody')).toThrow(
		'Invalid SKILL.md'
	);
});

it('rejects malformed YAML with an actionable import error', () => {
	expect(() => readSkillManifest('---\nname: [unterminated\n---\nBody')).toThrow(
		'Invalid SKILL.md'
	);
});

it('rejects missing frontmatter before a skill can be saved', () => {
	expect(() => readSkillManifest('Instructions without metadata')).toThrow('YAML frontmatter');
});

it('reads Windows line endings and preserves author metadata', () => {
	expect(
		readSkillManifest(
			'---\r\nname: sample\r\ndescription: Example\r\nmetadata:\r\n  owner: user\r\n---\r\n\r\nSteps\r\n'
		)
	).toEqual({
		slug: 'sample',
		description: 'Example',
		metadata: { owner: 'user' },
		allowImplicitInvocation: true,
		instructions: 'Steps'
	});
});
