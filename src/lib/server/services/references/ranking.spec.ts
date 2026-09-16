import { expect, it } from 'vitest';
import type { Url } from '$lib/models/references';
import { ReferenceRanking } from './ranking';

it('deduplicates reference candidates by URL', () => {
	const ranked = new ReferenceRanking().rank([
		{
			url: 'https://example.com' as Url,
			title: 'A',
			tier: 'community',
			relevanceNote: '',
			confidence: 90
		},
		{
			url: 'https://example.com' as Url,
			title: 'B',
			tier: 'official',
			relevanceNote: '',
			confidence: 100
		}
	]);
	expect(ranked).toHaveLength(1);
});

it('ranks official sources before community sources', () => {
	const ranked = new ReferenceRanking().rank([
		{
			url: 'https://community.test' as Url,
			title: 'Community',
			tier: 'community',
			relevanceNote: '',
			confidence: 100
		},
		{
			url: 'https://official.test' as Url,
			title: 'Official',
			tier: 'official',
			relevanceNote: '',
			confidence: 50
		}
	]);
	expect(ranked[0]?.tier).toBe('official');
});
