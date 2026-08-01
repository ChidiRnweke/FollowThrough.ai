import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { ReferenceId, ReferenceTier, Url } from '$lib/models/references';
import type { SourceAnchor } from '$lib/models/provenance';
import type { SuggestionId } from '$lib/models/suggestions';

export interface AcceptedReferenceLinkSource {
	readonly state: 'accepted';
	readonly id: ReferenceId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
}

export interface PendingReferenceLinkSource {
	readonly state: 'pending';
	readonly id: SuggestionId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly confidence?: number;
}

export interface AuthoredLinkSource {
	readonly state: 'authored';
	readonly id: string;
	readonly url: Url;
	readonly title: string;
}

export type ReferenceLinkSource =
	AcceptedReferenceLinkSource | PendingReferenceLinkSource | AuthoredLinkSource;

export interface AnchoredReferenceLink {
	readonly anchor: SourceAnchor;
	readonly source: ReferenceLinkSource;
}

export interface ResolvedReferenceLinkGroup {
	readonly key: string;
	readonly from: number;
	readonly to: number;
	readonly sources: readonly ReferenceLinkSource[];
}

interface ReferenceLinkPluginState {
	readonly decorations: DecorationSet;
	readonly groups: ReadonlyMap<string, ResolvedReferenceLinkGroup>;
}

const BLOCK_SEPARATOR = '\n\n';
const TIER_WEIGHT: Record<ReferenceTier, number> = {
	official: 0,
	standard: 1,
	vendor: 2,
	community: 3
};

export const REFERENCE_LINK_REBUILD = 'rebuild';
export const referenceLinkKey = new PluginKey<ReferenceLinkPluginState>('reference-links');

const compareSources = (left: ReferenceLinkSource, right: ReferenceLinkSource): number => {
	if (left.state === 'authored' || right.state === 'authored') return 0;
	if (left.state !== right.state) return left.state === 'accepted' ? -1 : 1;
	const tier = TIER_WEIGHT[left.tier] - TIER_WEIGHT[right.tier];
	if (tier !== 0) return tier;
	if (left.state === 'pending' && right.state === 'pending') {
		const confidence = (right.confidence ?? 0) - (left.confidence ?? 0);
		if (confidence !== 0) return confidence;
	}
	return left.url.localeCompare(right.url);
};

const flattenDocument = (
	doc: ProseMirrorNode
): { readonly text: string; readonly positions: number[] } => {
	let text = '';
	const positions: number[] = [];
	doc.descendants((node, pos) => {
		if (node.isText && node.text) {
			for (let index = 0; index < node.text.length; index++) {
				text += node.text[index];
				positions.push(pos + index);
			}
		} else if (node.isBlock && text.length > 0 && !text.endsWith(BLOCK_SEPARATOR)) {
			text += BLOCK_SEPARATOR;
			positions.push(-1, -1);
		}
		return true;
	});
	return { text, positions };
};

const resolveTextRange = (
	anchor: SourceAnchor,
	text: string,
	currentRevision: number
): { readonly from: number; readonly to: number } | undefined => {
	if (
		anchor.revision === currentRevision &&
		anchor.from !== undefined &&
		anchor.to !== undefined &&
		text.slice(anchor.from, anchor.to) === anchor.quote
	)
		return { from: anchor.from, to: anchor.to };
	const first = text.indexOf(anchor.quote);
	if (first < 0 || first !== text.lastIndexOf(anchor.quote)) return undefined;
	return { from: first, to: first + anchor.quote.length };
};

export const resolveReferenceLinkGroups = (
	doc: ProseMirrorNode,
	references: readonly AnchoredReferenceLink[],
	currentRevision: number
): readonly ResolvedReferenceLinkGroup[] => {
	const { text, positions } = flattenDocument(doc);
	const grouped = new Map<string, { from: number; to: number; sources: ReferenceLinkSource[] }>();
	for (const reference of references) {
		const range = resolveTextRange(reference.anchor, text, currentRevision);
		if (!range || range.from === range.to) continue;
		const from = positions[range.from];
		const to = positions[range.to - 1];
		if (from === undefined || to === undefined || from < 0 || to < 0) continue;
		const key = `${range.from}:${range.to}`;
		const group = grouped.get(key) ?? { from, to: to + 1, sources: [] };
		if (!group.sources.some((source) => source.url === reference.source.url))
			group.sources.push(reference.source);
		grouped.set(key, group);
	}
	return [...grouped.entries()].map(([key, group]) => ({
		key,
		from: group.from,
		to: group.to,
		sources: group.sources.sort(compareSources)
	}));
};

const buildState = (
	doc: ProseMirrorNode,
	references: readonly AnchoredReferenceLink[],
	currentRevision: number
): ReferenceLinkPluginState => {
	const groups = resolveReferenceLinkGroups(doc, references, currentRevision);
	const byKey = new Map(groups.map((group) => [group.key, group]));
	const decorations = groups.map((group) => {
		const primary = group.sources[0]!;
		const pendingOnly = group.sources.every((source) => source.state === 'pending');
		return Decoration.inline(group.from, group.to, {
			nodeName: 'a',
			href: primary.url,
			target: '_blank',
			rel: 'noopener noreferrer',
			class: pendingOnly ? 'reference-link reference-link--pending' : 'reference-link',
			'data-reference-key': group.key
		});
	});
	return { decorations: DecorationSet.create(doc, decorations), groups: byKey };
};

const editorLinkElementFrom = (target: EventTarget | null): HTMLAnchorElement | undefined => {
	if (!(target instanceof Element)) return undefined;
	return target.closest<HTMLAnchorElement>('a[href]') ?? undefined;
};

export const resolveAuthoredLinkGroup = (
	link: HTMLAnchorElement
): ResolvedReferenceLinkGroup | undefined => {
	const href = link.getAttribute('href')?.trim();
	if (!href) return undefined;
	let url: URL;
	try {
		url = new URL(href, window.location.href);
	} catch {
		return undefined;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
	return {
		key: `authored:${href}`,
		from: 0,
		to: 0,
		sources: [
			{
				state: 'authored',
				id: href,
				url: url.href as Url,
				title: link.getAttribute('title')?.trim() || link.textContent?.trim() || 'Link'
			}
		]
	};
};

const groupForLink = (
	view: EditorView,
	link: HTMLAnchorElement
): ResolvedReferenceLinkGroup | undefined => {
	const key = link.dataset.referenceKey;
	if (key) return referenceLinkKey.getState(view.state)?.groups.get(key);
	return resolveAuthoredLinkGroup(link);
};

const previewElementFrom = (target: EventTarget | null): HTMLElement | undefined => {
	if (!(target instanceof Element)) return undefined;
	return target.closest<HTMLElement>('[data-reference-preview]') ?? undefined;
};

export function createReferenceLinkPlugin(options: {
	getReferences: () => readonly AnchoredReferenceLink[];
	getRevision: () => number;
	onActivate: (group: ResolvedReferenceLinkGroup, anchor: HTMLAnchorElement) => void;
	onDeactivate: () => void;
}): Plugin {
	const activate = (view: EditorView, event: Event) => {
		const link = editorLinkElementFrom(event.target);
		if (!link) {
			options.onDeactivate();
			return;
		}
		const group = groupForLink(view, link);
		if (group) options.onActivate(group, link);
	};
	return new Plugin<ReferenceLinkPluginState>({
		key: referenceLinkKey,
		state: {
			init: (_, state) => buildState(state.doc, options.getReferences(), options.getRevision()),
			apply: (transaction, previous, _oldState, nextState) =>
				transaction.docChanged || transaction.getMeta(referenceLinkKey) === REFERENCE_LINK_REBUILD
					? buildState(nextState.doc, options.getReferences(), options.getRevision())
					: previous
		},
		props: {
			decorations(state) {
				return referenceLinkKey.getState(state)?.decorations;
			},
			handleDOMEvents: {
				pointerover(view, event) {
					activate(view, event);
					return false;
				},
				pointerout(_view, event) {
					if (editorLinkElementFrom(event.relatedTarget) || previewElementFrom(event.relatedTarget))
						return false;
					options.onDeactivate();
					return false;
				},
				focusin(view, event) {
					activate(view, event);
					return false;
				},
				focusout(_view, event) {
					if (editorLinkElementFrom(event.relatedTarget) || previewElementFrom(event.relatedTarget))
						return false;
					options.onDeactivate();
					return false;
				},
				click(_view, event) {
					const link = editorLinkElementFrom(event.target);
					if (!link || !resolveAuthoredLinkGroup(link)) return false;
					event.preventDefault();
					if (event.ctrlKey || event.metaKey) {
						const opened = window.open(link.href, '_blank', 'noopener,noreferrer');
						if (opened) opened.opener = null;
						return true;
					}
					return false;
				},
				keydown(_view, event) {
					if (event.key === 'Escape') options.onDeactivate();
					return false;
				}
			}
		}
	});
}
