import type { Component } from 'svelte';
import { Plugin } from '@tiptap/pm/state';
import {
	DrawioNode as DrawioSchema,
	MermaidNode as MermaidSchema,
	NoteLinkMark as NoteLinkSchema
} from '$lib/infrastructure/notes/schema/nodes';

export {
	AIHighlightNode,
	CalloutNode,
	IFrameNode,
	TodoNodeBase,
	WidgetNodeBase
} from '$lib/infrastructure/notes/schema/nodes';

export interface NoteLinkOptions {
	/**
	 * Follow a link. Returns whether it handled the click, so a host that cannot navigate
	 * leaves the event alone rather than swallowing it into a dead end.
	 */
	onOpen?: (noteId: string, options: { readonly background: boolean }) => boolean;
}

export const NoteLinkMark = NoteLinkSchema.extend<NoteLinkOptions>({
	addOptions() {
		return { onOpen: undefined };
	},
	/**
	 * StarterKit configures `link` with `openOnClick: false`, so a note link has to supply
	 * its own. Handled here rather than by an `<a href>` navigation so the target lands in
	 * the workbench instead of reloading the shell; ctrl/⌘-click opens it behind the
	 * current pane, matching the tree and the tab strip.
	 */
	addProseMirrorPlugins() {
		const onOpen = this.options.onOpen;
		if (!onOpen) return [];
		return [
			new Plugin({
				props: {
					handleClick: (_view, _pos, event) => {
						const target = event.target;
						if (!(target instanceof Element)) return false;
						const noteId = target.closest('a[data-note-id]')?.getAttribute('data-note-id');
						if (!noteId) return false;
						if (!onOpen(noteId, { background: event.metaKey || event.ctrlKey })) return false;
						event.preventDefault();
						return true;
					}
				}
			})
		];
	}
});

export interface MermaidOptions {
	onRevise?: (
		source: string,
		instruction: string
	) => Promise<{ readonly source: string; readonly title?: string }>;
	onConvert?: (source: string, instruction?: string) => Promise<string>;
	/** Stops a revision or conversion that is still running on the server. */
	onCancel?: (kind: 'revise' | 'convert') => void;
	onReview?: (reference: string) => void;
	onDismiss?: (reference: string) => Promise<void>;
}

export const MermaidNode = MermaidSchema.extend<MermaidOptions>({
	addOptions() {
		return {
			onRevise: undefined,
			onConvert: undefined,
			onReview: undefined,
			onDismiss: undefined
		};
	}
});

export interface DrawioReferenceView {
	readonly title?: string;
	readonly renderedSvg?: string;
}

export interface DrawioPreviewProps {
	readonly svg: string;
	readonly alt: string;
	readonly class?: string;
}

export interface DrawioOptions {
	getDiagram?: (reference: string) => DrawioReferenceView | undefined;
	resolveHref?: (reference: string) => string | undefined;
	preview?: Component<DrawioPreviewProps>;
}

export const DrawioNode = DrawioSchema.extend<DrawioOptions>({
	addOptions() {
		return { getDiagram: undefined, resolveHref: undefined, preview: undefined };
	}
});
