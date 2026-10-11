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
