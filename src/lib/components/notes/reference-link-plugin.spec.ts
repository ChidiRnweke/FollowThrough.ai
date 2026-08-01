// @vitest-environment jsdom

import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import type { ReferenceId, Url } from '$lib/models/references';
import type { SuggestionId } from '$lib/models/suggestions';
import { anchorBuilder, testAnchorId } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	resolveReferenceLinkGroups,
	resolveAuthoredLinkGroup,
	type AcceptedReferenceLinkSource,
	type AnchoredReferenceLink,
	type PendingReferenceLinkSource,
	type ReferenceLinkSource
} from './reference-link-plugin';

const schema = getSchema([StarterKit]);
const documentWith = (text: string) =>
	schema.nodeFromJSON({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

const acceptedSource = (
	url = 'https://accepted.example/source' as Url,
	overrides: Partial<AcceptedReferenceLinkSource> = {}
): AcceptedReferenceLinkSource => ({
	state: 'accepted',
	id: crypto.randomUUID() as ReferenceId,
	url,
	title: 'Accepted source',
	tier: 'official',
	...overrides
});

const pendingSource = (
	url = 'https://pending.example/source' as Url,
	overrides: Partial<PendingReferenceLinkSource> = {}
): PendingReferenceLinkSource => ({
	state: 'pending',
	id: crypto.randomUUID() as SuggestionId,
	url,
	title: 'Pending source',
	tier: 'official',
	confidence: 90,
	...overrides
});

const anchored = (
	source: ReferenceLinkSource,
	overrides: Partial<AnchoredReferenceLink['anchor']> = {}
): AnchoredReferenceLink => ({
	anchor: anchorBuilder({ quote: 'OAuth', from: 4, to: 9, ...overrides }),
	source
});

describe('Inline reference link invariants', () => {
	it('reads an authored ProseMirror link without changing its stored representation', () => {
		const link = document.createElement('a');
		link.href = 'https://en.wikipedia.org/wiki/Odysseus';
		link.title = 'Odysseus';
		link.textContent = 'Odysseus';
		expect(resolveAuthoredLinkGroup(link)?.sources[0]?.title).toBe('Odysseus');
	});

	it('uses current-revision offsets when the same quote appears more than once', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('OAuth and OAuth'),
			[anchored(acceptedSource(), { quote: 'OAuth', from: 10, to: 15, revision: 1 })],
			1
		);
		expect(groups[0]?.key).toBe('10:15');
	});

	it('hides a stale anchor when its quote is ambiguous', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('OAuth and OAuth'),
			[anchored(acceptedSource(), { quote: 'OAuth', revision: 1 })],
			2
		);
		expect(groups).toEqual([]);
	});

	it('repairs a stale anchor when its quote is unique', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('Use OAuth for authorization'),
			[anchored(acceptedSource(), { revision: 1 })],
			2
		);
		expect(groups[0]?.key).toBe('4:9');
	});

	it('groups sources that resolve to the same words', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('Use OAuth for authorization'),
			[anchored(acceptedSource()), anchored(pendingSource(), { id: testAnchorId(2) })],
			1
		);
		expect(groups[0]?.sources).toHaveLength(2);
	});

	it('keeps an accepted source primary while proposals remain pending', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('Use OAuth for authorization'),
			[
				anchored(pendingSource(undefined, { tier: 'official' })),
				anchored(acceptedSource(undefined, { tier: 'community' }))
			],
			1
		);
		expect(groups[0]?.sources[0]?.state).toBe('accepted');
	});

	it('ranks authoritative pending sources before community sources', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('Use OAuth for authorization'),
			[
				anchored(pendingSource('https://community.example' as Url, { tier: 'community' })),
				anchored(pendingSource('https://official.example' as Url, { tier: 'official' }))
			],
			1
		);
		const primary = groups[0]?.sources[0];
		expect(primary?.state === 'authored' ? undefined : primary?.tier).toBe('official');
	});

	it('deduplicates the same URL within one text range', () => {
		const url = 'https://example.com/source' as Url;
		const groups = resolveReferenceLinkGroups(
			documentWith('Use OAuth for authorization'),
			[anchored(acceptedSource(url)), anchored(pendingSource(url))],
			1
		);
		expect(groups[0]?.sources).toHaveLength(1);
	});

	it('hides a reference when its quote no longer exists', () => {
		const groups = resolveReferenceLinkGroups(
			documentWith('Use another protocol'),
			[anchored(acceptedSource())],
			2
		);
		expect(groups).toEqual([]);
	});
});
