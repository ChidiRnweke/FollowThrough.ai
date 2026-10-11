// @vitest-environment jsdom

import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import type { ReferenceId, Url } from '$lib/models/references';
import type { SuggestionId } from '$lib/models/suggestions';
import { anchorBuilder, testAnchorId } from '$lib/testing/workspace/fixtures/domain-builders';
import { EditorView } from '@tiptap/pm/view';
import { EditorState } from '@tiptap/pm/state';
import {
	createReferenceLinkPlugin,
	type ResolvedReferenceLinkGroup,
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

/** Hover every rendered reference link and return the groups the editor offered. */
const hoveredGroups = (
	doc: ReturnType<typeof documentWith>,
	references: readonly AnchoredReferenceLink[],
	revision: number
): ResolvedReferenceLinkGroup[] => {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const offered: ResolvedReferenceLinkGroup[] = [];
	const view = new EditorView(host, {
		state: EditorState.create({
			doc,
			plugins: [
				createReferenceLinkPlugin({
					getReferences: () => references,
					getRevision: () => revision,
					onActivate: (group) => offered.push(group),
					onDeactivate: () => undefined
				})
			]
		})
	});
	for (const link of host.querySelectorAll('a[data-reference-key]'))
		link.dispatchEvent(new Event('pointerover', { bubbles: true }));
	view.destroy();
	host.remove();
	return offered;
};

describe('Inline reference link invariants', () => {
	it('reads an authored ProseMirror link without changing its stored representation', () => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		const offered: ResolvedReferenceLinkGroup[] = [];
		const linked = schema.nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'Odysseus',
							marks: [
								{
									type: 'link',
									attrs: { href: 'https://en.wikipedia.org/wiki/Odysseus', title: 'Odysseus' }
								}
							]
						}
					]
				}
			]
		});
		const view = new EditorView(host, {
			state: EditorState.create({
				doc: linked,
				plugins: [
					createReferenceLinkPlugin({
						getReferences: () => [],
						getRevision: () => 1,
						onActivate: (group) => offered.push(group),
						onDeactivate: () => undefined
					})
				]
			})
		});
		host.querySelector('a')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
		view.destroy();
		host.remove();

		expect(offered.map((group) => group.sources[0]?.title)).toEqual(['Odysseus']);
	});

	it('uses current-revision offsets when the same quote appears more than once', () => {
		const groups = hoveredGroups(
			documentWith('OAuth and OAuth'),
			[anchored(acceptedSource(), { quote: 'OAuth', from: 10, to: 15, revision: 1 })],
			1
		);
		expect(groups.map((group) => group.key)).toEqual(['10:15']);
	});

	it('hides a stale anchor when its quote is ambiguous', () => {
		const groups = hoveredGroups(
			documentWith('OAuth and OAuth'),
			[anchored(acceptedSource(), { quote: 'OAuth', revision: 1 })],
			2
		);
		expect(groups).toEqual([]);
	});

	it('repairs a stale anchor when its quote is unique', () => {
		const groups = hoveredGroups(
			documentWith('Use OAuth for authorization'),
			[anchored(acceptedSource(), { revision: 1 })],
			2
		);
		expect(groups.map((group) => group.key)).toEqual(['4:9']);
	});

	it('groups sources that resolve to the same words', () => {
		const groups = hoveredGroups(
			documentWith('Use OAuth for authorization'),
			[anchored(acceptedSource()), anchored(pendingSource(), { id: testAnchorId(2) })],
			1
		);
		expect(groups[0]?.sources).toHaveLength(2);
	});

	it('keeps an accepted source primary while proposals remain pending', () => {
		const groups = hoveredGroups(
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
		const groups = hoveredGroups(
			documentWith('Use OAuth for authorization'),
			[
				anchored(pendingSource('https://community.example' as Url, { tier: 'community' })),
				anchored(pendingSource('https://official.example' as Url, { tier: 'official' }))
			],
			1
		);
		expect(groups[0]?.sources.map((source) => source.url)).toEqual([
			'https://official.example',
			'https://community.example'
		]);
	});

	it('deduplicates the same URL within one text range', () => {
		const url = 'https://example.com/source' as Url;
		const groups = hoveredGroups(
			documentWith('Use OAuth for authorization'),
			[anchored(acceptedSource(url)), anchored(pendingSource(url))],
			1
		);
		expect(groups[0]?.sources).toHaveLength(1);
	});

	it('hides a reference when its quote no longer exists', () => {
		const groups = hoveredGroups(
			documentWith('Use another protocol'),
			[anchored(acceptedSource())],
			2
		);
		expect(groups).toEqual([]);
	});
});
