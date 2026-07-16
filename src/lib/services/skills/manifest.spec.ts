import { describe, expect, it } from 'vitest';
import { SkillManifestCodec, validateAttachmentPath } from './manifest';

describe('SkillManifestCodec', () => {
	it('round-trips the canonical Agent Skills representation', () => {
		const codec = new SkillManifestCodec();
		const raw = codec.serialize({
			slug: 'review-notes',
			description: 'Review a note for unresolved decisions.',
			license: 'MIT',
			compatibility: 'Requires note read access.',
			metadata: { owner: 'product' },
			allowImplicitInvocation: false,
			instructions: '# Workflow\n\nRead the note before proposing changes.'
		});
		expect(codec.parse(raw)).toEqual({
			slug: 'review-notes',
			description: 'Review a note for unresolved decisions.',
			license: 'MIT',
			compatibility: 'Requires note read access.',
			metadata: { owner: 'product' },
			allowImplicitInvocation: false,
			instructions: '# Workflow\n\nRead the note before proposing changes.'
		});
	});

	it('rejects non-portable skill names', () => {
		const codec = new SkillManifestCodec();
		expect(() => codec.parse('---\nname: Bad Name\ndescription: Test\n---\nBody')).toThrow(
			'Invalid SKILL.md'
		);
	});

	it('rejects traversal resource paths', () => {
		expect(() => validateAttachmentPath('../secret.txt')).toThrow('safe relative path');
	});
});
