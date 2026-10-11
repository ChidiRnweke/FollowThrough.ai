import { expect, it } from 'vitest';
import type { ReferenceSource, Url } from '$lib/models/references';
import { ReferenceDiscovery } from './discovery';
it('deduplicates citations and prepares their authority and readable fallback', () => {
	const source: ReferenceSource = {
		url: 'https://docs.example.com/auth' as Url,
		hostname: 'docs.example.com'
	};
	expect(new ReferenceDiscovery().prepare([source, source], 'Use OAuth.')).toEqual([
		{
			url: source.url,
			title: 'docs.example.com',
			tier: 'vendor',
			confidence: 75,
			relevanceNote: 'Supporting source for “Use OAuth.”.'
		}
	]);
});

it('deduplicates reference candidates by URL', () => {
	const ranked = new ReferenceDiscovery().rank([
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
	const ranked = new ReferenceDiscovery().rank([
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
