<script lang="ts">
	import { mount, onMount, unmount, untrack } from 'svelte';
	import { getTextBetween, getTextSerializersFromSchema, isTextSelection } from '@tiptap/core';
	import type { BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu';
	import { Plugin, PluginKey } from '@tiptap/pm/state';
	import { Decoration, DecorationSet } from '@tiptap/pm/view';
	import type { Diagram, DiagramId, DiagramSuggestion } from '$lib/models/diagrams';
	import type {
		NoteId,
		NoteLinkTarget,
		ProseMirrorDocument,
		TextSelection
	} from '$lib/models/notes';
	import { changedTopLevelBlockIndices } from '$lib/models/notes/note-shimmer';
	import type { ReferenceView } from '$lib/models/references';
	import type { SkillSummary } from '$lib/models/skills';
	import type { SuggestionId } from '$lib/models/suggestions';
	import { createEditor } from '$lib/components/edra/commands/editor.js';
	import { completePendingConversion } from '$lib/components/edra/commands/diagram-references.js';
	import { rankNoteLinkTargets } from '$lib/components/edra/commands/NoteLinkSuggestion.js';
	import type { InlineSuggestionRequestInput } from '$lib/components/edra/commands/InlineSuggestion.js';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import Tiptap from '$lib/components/edra/Tiptap.svelte';
	import EdraEditor from '$lib/components/edra/editor.svelte';
	import BubbleMenu from '$lib/components/edra/BubbleMenu.svelte';
	import { Button } from '$lib/components/ui/button';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import SafeSvgPreview from '$lib/components/shared/safe-svg-preview.svelte';
	import {
		FtCopied as ClipboardCheck,
		FtReferences as Waypoints,
		FtReading as BookOpen,
		FtWorkflow as Workflow,
		FtSkills as Wrench,
		FtSuggestion as Suggestion,
		FtChevronDown as ChevronDown
	} from '$lib/components/icons';
	import { agentActions } from '../agent/agent-actions';
	import {
		createSuggestionAnchorPlugin,
		suggestionAnchorKey,
		SUGGESTION_ANCHOR_REBUILD,
		type AnchoredSuggestion
	} from '../suggestions/suggestion-anchor-plugin';
	import SuggestionInlineWidget from '../suggestions/suggestion-inline-widget.svelte';
	import ReferenceLinkPreview from './reference-link-preview.svelte';
	import {
		createReferenceLinkPlugin,
		referenceLinkKey,
		REFERENCE_LINK_REBUILD,
		type AnchoredReferenceLink,
		type ResolvedReferenceLinkGroup
	} from './reference-link-plugin';
	import { createSelectionActionPlugin, selectionActionKey } from './selection-action-plugin';
	import TodoNodeView from '../todos/todo-node.svelte';
	import { toast } from 'svelte-sonner';
	import {
		selectionClipboardItem,
		selectionPlainText
	} from '$lib/components/edra/commands/clipboard-payload';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import ActionProgress from '$lib/components/shared/action-progress.svelte';
	import { uploadNoteAttachment } from './attachment-upload';

	export type NoteAiAction = 'promises' | 'relate' | 'reference' | 'diagram';
	const BLOCK_SEPARATOR = '\n\n';
	/** Long enough for the wash to finish; short enough that a second update can follow. */
	const SHIMMER_DURATION = 3000;
	const shimmerKey = new PluginKey('note-block-shimmer');

	const runningCopy: Record<NoteAiAction, string> = {
		promises: 'Reading for commitments',
		relate: 'Looking for related notes',
		reference: 'Looking for references',
		diagram: 'Drawing a diagram'
	};

	const runningIcon: Record<NoteAiAction, typeof Workflow> = {
		promises: ClipboardCheck,
		relate: Waypoints,
		reference: BookOpen,
		diagram: Workflow
	};

	function preserveEditorSelection(event: MouseEvent): void {
		// Keep the Tiptap selection intact until the bubble-menu action reads it.
		event.preventDefault();
	}

	function nearestTextOffset(fullText: string, selectedText: string, approximate: number): number {
		let nearest = -1;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (let offset = fullText.indexOf(selectedText); offset >= 0;) {
			const distance = Math.abs(offset - approximate);
			if (distance < nearestDistance) {
				nearest = offset;
				nearestDistance = distance;
			}
			offset = fullText.indexOf(selectedText, offset + 1);
		}
		return nearest;
	}

	let {
		noteId,
		revision,
		inlineSuggestionsEnabled = true,
		document,
		references = [],
		skills = [],
		linkableNotes = [],
		onOpenNote,
		perNote,
		onchange,
		onaction,
		onskill,
		onask,
		onreviseMermaid,
		onconvertMermaid,
		onrejectDrawio,
		diagrams = [],
		activeAction,
		actionCancelling = false,
		oncancelaction,
		oncancelmermaid
	}: {
		noteId: NoteId;
		revision: number;
		inlineSuggestionsEnabled?: boolean;
		document: ProseMirrorDocument;
		references?: readonly ReferenceView[];
		skills?: readonly SkillSummary[];
		/** Notes offered when the author types `@`. */
		linkableNotes?: readonly NoteLinkTarget[];
		/** Follow a note link, so the target lands in the workbench rather than reloading. */
		onOpenNote?: (noteId: NoteId, options: { readonly background: boolean }) => void;
		perNote?: PerNoteEditorSlot;
		onchange?: () => void;
		onaction?: (action: NoteAiAction, selection?: TextSelection, insertAt?: number) => void;
		onskill?: (skillName: string) => void;
		/** Hands an open-ended prompt about the current selection to the agent chat. */
		onask?: (prompt: string) => void;
		onreviseMermaid: (
			source: string,
			instruction: string
		) => Promise<{ readonly source: string; readonly title?: string }>;
		onconvertMermaid: (source: string, instruction?: string) => Promise<DiagramSuggestion>;
		onrejectDrawio: (suggestionId: SuggestionId) => Promise<void>;
		diagrams?: readonly Diagram[];
		/** The AI selection action running against this note, if any. */
		activeAction?: NoteAiAction;
		/** True once its cancellation was requested but the run has not settled. */
		actionCancelling?: boolean;
		oncancelaction?: () => void;
		/** Stops a revision or conversion started from a mermaid node in this note. */
		oncancelmermaid?: (kind: 'revise' | 'convert') => void;
	} = $props();

	let initialized = false;
	let hydrated = $state(false);
	/** Guards the shimmer teardown: only the latest replacement removes its decoration. */
	let shimmerGeneration = 0;
	let activeLink = $state<
		{ readonly group: ResolvedReferenceLinkGroup; readonly anchor: HTMLAnchorElement } | undefined
	>();
	let activeLinkUrl = $state('');
	let closeLinkFrame: number | undefined;

	function retainActiveLink(): void {
		if (closeLinkFrame !== undefined) cancelAnimationFrame(closeLinkFrame);
		closeLinkFrame = undefined;
	}

	function closeActiveLink(): void {
		retainActiveLink();
		activeLink = undefined;
		activeLinkUrl = '';
	}

	function scheduleActiveLinkClose(frames = 10): void {
		retainActiveLink();
		const wait = (remaining: number) => {
			closeLinkFrame = requestAnimationFrame(() => {
				if (remaining > 1) wait(remaining - 1);
				else closeActiveLink();
			});
		};
		wait(frames);
	}
	/**
	 * Fetches proactive ghost text. Failures — including the abort the extension
	 * issues on the next keystroke — resolve to no suggestion rather than
	 * surfacing: an autocomplete that cannot answer should stay quiet.
	 */
	async function requestInlineSuggestion(
		input: InlineSuggestionRequestInput,
		signal: AbortSignal
	): Promise<{ readonly text: string }> {
		try {
			const response = await fetch('/api/inline-suggestions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					requestId: crypto.randomUUID(),
					noteId,
					revision,
					...input
				}),
				signal
			});
			if (!response.ok) return { text: '' };
			const result = (await response.json()) as
				| { readonly outcome: 'suggested'; readonly text: string }
				| { readonly outcome: 'no_suggestion' };
			return result.outcome === 'suggested' ? { text: result.text } : { text: '' };
		} catch {
			return { text: '' };
		}
	}

	const editor = createEditor(
		{
			ariaLabel: 'Note body',
			onReviseMermaid: (source, instruction) => onreviseMermaid(source, instruction),
			onConvertMermaid: async (source, instruction) =>
				(await onconvertMermaid(source, instruction)).id,
			onCancelMermaid: (kind) => oncancelmermaid?.(kind),
			onReviewDrawio: (reference) => {
				const candidate = perNote?.suggestions.items.find(
					(item) => item.suggestion.id === reference
				)?.suggestion;
				if (candidate?.kind === 'diagram' && candidate.payload.kind === 'drawio')
					perNote?.suggestions.requestReview(candidate);
			},
			onDismissDrawio: async (reference) => {
				const candidate = perNote?.suggestions.items.find(
					(item) => item.suggestion.id === reference
				)?.suggestion;
				if (candidate?.kind !== 'diagram' || candidate.payload.kind !== 'drawio')
					throw new Error('The draw.io conversion is no longer available.');
				await onrejectDrawio(candidate.id);
			},
			getDrawioDiagram: (reference) => {
				const candidate = diagrams.find((diagram) => diagram.id === reference);
				return candidate?.kind === 'drawio' ? candidate : undefined;
			},
			resolveDrawioHref: (reference) => `/notes/${noteId}/diagrams/${reference}`,
			drawioPreview: SafeSvgPreview,
			// Pasted/dropped images upload as note attachments; the src is the stable
			// content endpoint (a 302 to a fresh presigned URL), never the expiring
			// upload URL itself.
			onFileUpload: async (file) => {
				try {
					return await uploadNoteAttachment(noteId, file);
				} catch (error) {
					toast.error(error instanceof Error ? error.message : 'Image upload failed');
					throw error;
				}
			},
			getInlineSuggestion: requestInlineSuggestion,
			findLinkableNotes: (query) => rankNoteLinkTargets(linkableNotes, query),
			// Read through the prop inside the closure: `createEditor` runs once, so
			// capturing it here would pin whatever the first render happened to pass.
			onOpenNoteLink: (id: string, options: { background: boolean }) => {
				if (!onOpenNote) return false;
				onOpenNote(id as NoteId, options);
				return true;
			},
			onUpdate: () => {
				closeActiveLink();
				if (initialized) onchange?.();
			}
		},
		[TodoNode(TodoNodeView as never)]
	);
	$effect(() => {
		editor?.commands.setInlineSuggestionsEnabled(inlineSuggestionsEnabled);
	});
	// Attach per-note stores so TipTap NodeViews (TodoNode, SuggestionInlineWidget)
	// can resolve the right note's todos/suggestions without going through a
	// singleton that would describe only the focused pane.
	$effect(() => {
		if (editor) editor.perNote = perNote;
	});

	function readSelection(): TextSelection | undefined {
		if (!editor) return undefined;
		const { from, to, empty } = editor.state.selection;
		if (empty) return undefined;

		const textSerializers = getTextSerializersFromSchema(editor.schema);
		const options = { blockSeparator: BLOCK_SEPARATOR, textSerializers };
		const text = getTextBetween(editor.state.doc, { from, to }, options);
		if (!text.trim()) return undefined;

		const plainText = editor.getText({ blockSeparator: BLOCK_SEPARATOR });
		const approximate = getTextBetween(editor.state.doc, { from: 0, to: from }, options).length;
		const plainFrom = nearestTextOffset(plainText, text, approximate);
		if (plainFrom < 0) return undefined;

		return {
			noteId,
			revision,
			from: plainFrom,
			to: plainFrom + text.length,
			text
		};
	}

	function runSelectionAction(action: NoteAiAction): void {
		if (!editor) return;
		const { from, to, empty } = editor.state.selection;
		// Hold the range before handing off, so the wash is already in place by the
		// time the parent flips activeAction. It is released by the effect below.
		if (!empty) {
			editor.view.dispatch(editor.view.state.tr.setMeta(selectionActionKey, { from, to }));
		}
		onaction?.(action, readSelection(), to);
	}

	/**
	 * Reproduces the plugin's own predicate, plus one exception. The default hides
	 * the menu unless the editor or something inside the menu holds focus — but the
	 * running status replaces the buttons, so the click target unmounts and focus
	 * falls to the body, hiding the status the click was meant to produce. While an
	 * action runs, a live range is enough.
	 */
	const bubbleShouldShow: NonNullable<BubbleMenuPluginProps['shouldShow']> = ({
		element,
		view,
		state,
		from,
		to
	}) => {
		const { doc, selection } = state;
		if (selection.empty || !editor?.isEditable) return false;
		if (!doc.textBetween(from, to).length && isTextSelection(selection)) return false;
		if (activeAction !== undefined) return true;
		return view.hasFocus() || element.contains(window.document.activeElement);
	};

	// Release the wash once the action settles, however it settled — the parent
	// clears activeAction on success, failure, and the nothing-found paths alike.
	$effect(() => {
		if (activeAction !== undefined) return;
		untrack(() => {
			if (!editor) return;
			// Undefined before onMount registers the plugin; empty when nothing is held.
			const held = selectionActionKey.getState(editor.view.state);
			if (!held || held.find().length === 0) return;
			editor.view.dispatch(editor.view.state.tr.setMeta(selectionActionKey, null));
		});
	});

	/** Plain text of the current selection, '' when there is none. */
	function selectionText(): string {
		return editor ? selectionPlainText(editor.state) : '';
	}

	async function copySelectionRaw(): Promise<void> {
		const text = selectionText();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			toast.error('The clipboard could not be written');
		}
	}

	async function copySelectionFormatted(): Promise<void> {
		if (!editor) return;
		// A direct call, not a `copy` event, so it misses the editor's own handler —
		// it shares the payload builder instead, and pastes the same pictures.
		try {
			await navigator.clipboard.write([selectionClipboardItem(editor.state)]);
		} catch {
			toast.error('The clipboard could not be written');
		}
	}

	async function pasteRaw(): Promise<void> {
		if (!editor) return;
		try {
			const text = await navigator.clipboard.readText();
			if (!text) return;
			editor.view.focus();
			editor.view.pasteText(text);
		} catch {
			toast.error('The clipboard could not be read');
		}
	}

	async function pasteFormatted(): Promise<void> {
		if (!editor) return;
		try {
			const htmlItem = (await navigator.clipboard.read()).find((item) =>
				item.types.includes('text/html')
			);
			// No rich content on the clipboard: raw is the formatted answer too.
			if (!htmlItem) return await pasteRaw();
			const html = await (await htmlItem.getType('text/html')).text();
			editor.view.focus();
			editor.view.pasteHTML(html);
		} catch {
			toast.error('The clipboard could not be read');
		}
	}

	// Pending suggestions whose source text can be highlighted inline.
	const anchored: readonly AnchoredSuggestion[] = $derived(
		(perNote?.suggestions.items ?? []).flatMap((item) =>
			item.anchor &&
			item.suggestion.noteId === noteId &&
			item.suggestion.status === 'proposed' &&
			item.suggestion.kind !== 'reference'
				? [{ id: item.suggestion.id, kind: item.suggestion.kind, quote: item.anchor.quote }]
				: []
		)
	);
	const linkedReferences: readonly AnchoredReferenceLink[] = $derived([
		...references.flatMap((view) =>
			view.anchor
				? [
						{
							anchor: view.anchor,
							source: {
								state: 'accepted' as const,
								id: view.reference.id,
								url: view.reference.url,
								title: view.reference.title,
								tier: view.reference.tier
							}
						}
					]
				: []
		),
		...(perNote?.suggestions.items ?? []).flatMap((view) =>
			view.anchor &&
			view.suggestion.noteId === noteId &&
			view.suggestion.status === 'proposed' &&
			view.suggestion.kind === 'reference'
				? [
						{
							anchor: view.anchor,
							source: {
								state: 'pending' as const,
								id: view.suggestion.id,
								url: view.suggestion.payload.url,
								title: view.suggestion.payload.title,
								tier: view.suggestion.payload.tier,
								confidence: view.suggestion.confidence
							}
						}
					]
				: []
		)
	]);

	// The two plugins below live on the Tiptap editor, which outlives this component's
	// deriveds: `editor.destroy()` runs from a teardown effect, and a transaction landing
	// during that teardown would read a derived whose owning effect is already gone
	// (`derived_inert`, and a stale value). Mirroring into plain values the plugin
	// closures read instead is correct in every case — a torn-down editor's decorations
	// are discarded anyway. Seeded eagerly because each plugin's `state.init` reads its
	// getter the moment it is registered, before this effect first runs.
	let anchoredSnapshot = untrack(() => anchored);
	let linkedReferencesSnapshot = untrack(() => linkedReferences);
	let revisionSnapshot = untrack(() => revision);

	$effect(() => {
		anchoredSnapshot = anchored;
		linkedReferencesSnapshot = linkedReferences;
		revisionSnapshot = revision;
	});

	onMount(() => {
		if (!editor) return;

		// Initial content only; the page remounts per note via {#key}.
		editor.commands.setContent(untrack(() => document) as never);
		initialized = true;
		editor.registerPlugin(
			createSuggestionAnchorPlugin({
				getAnchored: () => anchoredSnapshot,
				renderWidget: (suggestionId) => {
					const target = window.document.createElement('div');
					target.className = 'suggestion-inline-widget-host';
					target.contentEditable = 'false';
					const instance = mount(SuggestionInlineWidget, {
						target,
						props: { suggestionId, editor }
					});
					return { dom: target, destroy: () => void unmount(instance) };
				}
			})
		);
		editor.registerPlugin(
			createReferenceLinkPlugin({
				getReferences: () => linkedReferencesSnapshot,
				getRevision: () => revisionSnapshot,
				onActivate: (group, anchor) => {
					retainActiveLink();
					activeLink = { group, anchor };
					activeLinkUrl = group.sources[0]?.url ?? '';
				},
				onDeactivate: scheduleActiveLinkClose
			})
		);
		editor.registerPlugin(createSelectionActionPlugin());
		editor.on('selectionUpdate', () => {
			const selection = readSelection();
			if (selection) perNote?.selection.set(selection);
			else perNote?.selection.clear();
		});
		hydrated = true;
		return retainActiveLink;
	});

	// Rebuild highlights whenever the anchored suggestion set changes. The dispatch
	// must stay untracked: it mutates editor state, which would re-trigger this effect.
	$effect(() => {
		void anchored;
		void linkedReferences;
		if (!editor) return;
		untrack(() => {
			closeActiveLink();
			editor.view.dispatch(
				editor.view.state.tr
					.setMeta(suggestionAnchorKey, SUGGESTION_ANCHOR_REBUILD)
					.setMeta(referenceLinkKey, REFERENCE_LINK_REBUILD)
			);
		});
	});

	/**
	 * Briefly re-render the blocks an external revision changed. Applied as a
	 * ProseMirror node decoration — a class on each changed block — so it rides
	 * the editor's own DOM rendering rather than fighting it, and survives any
	 * rebuild. Transient: the decoration is removed after `SHIMMER_DURATION`,
	 * and a refresh never passes a previous document, so a note that is merely
	 * reopened shows nothing.
	 */
	function shimmerChangedBlocks(
		previousDocument: ProseMirrorDocument,
		nextDocument: ProseMirrorDocument
	): void {
		if (!editor) return;
		const indices = changedTopLevelBlockIndices(previousDocument, nextDocument);
		if (indices.length === 0) return;
		const positions: number[] = [];
		editor.state.doc.forEach((_node, offset, index) => {
			if (indices.includes(index)) positions.push(offset);
		});
		if (positions.length === 0) return;
		const plugin = new Plugin({
			key: shimmerKey,
			props: {
				decorations(state) {
					const decorations: Decoration[] = [];
					for (const pos of positions) {
						const node = state.doc.nodeAt(pos);
						if (node)
							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, { class: 'note-block-shimmer' })
							);
					}
					return DecorationSet.create(state.doc, decorations);
				}
			}
		});
		const generation = shimmerGeneration + 1;
		shimmerGeneration = generation;
		editor.view.updateState(
			editor.state.reconfigure({ plugins: [...editor.state.plugins, plugin] })
		);
		window.setTimeout(() => {
			if (editor && shimmerGeneration === generation)
				editor.view.updateState(
					editor.state.reconfigure({
						plugins: editor.state.plugins.filter((p) => p.spec.key !== shimmerKey)
					})
				);
		}, SHIMMER_DURATION);
	}

	export function getDocument(): ProseMirrorDocument {
		return (editor?.getJSON() ?? { type: 'doc', content: [] }) as unknown as ProseMirrorDocument;
	}

	export function getPlainText(): string {
		return editor?.getText({ blockSeparator: '\n\n' }) ?? '';
	}

	export function replaceDocument(
		nextDocument: ProseMirrorDocument,
		previousDocument?: ProseMirrorDocument
	): void {
		if (!editor) return;
		initialized = false;
		editor.commands.setContent(nextDocument as never);
		initialized = true;
		if (previousDocument) shimmerChangedBlocks(previousDocument, nextDocument);
	}

	export function focusStart(): void {
		editor?.commands.focus('start');
	}

	export function focusEnd(): void {
		editor?.commands.focus('end');
	}

	/** Insert a mermaid diagram node at the given ProseMirror position. */
	export function insertMermaid(at: number, source: string): void {
		editor
			?.chain()
			.focus()
			.insertContentAt(at, {
				type: 'mermaid',
				content: source ? [{ type: 'text', text: source }] : []
			})
			.run();
	}

	/**
	 * Swap one mermaid node's source for a revised one, matched by its current text.
	 *
	 * The live revision path applies the result inside the node view that asked for
	 * it. This is for the other path: after a refresh that node view is a fresh
	 * component with no memory of the request, so the source it had when the
	 * revision started is the only handle left on it. Returns whether a node matched.
	 */
	export function replaceMermaid(previousSource: string, source: string): boolean {
		if (!editor) return false;
		let target: number | undefined;
		editor.state.doc.descendants((node, pos) => {
			if (target !== undefined) return false;
			if (node.type.name === 'mermaid' && node.textContent === previousSource) target = pos;
			return true;
		});
		if (target === undefined) return false;
		editor
			.chain()
			.focus()
			.insertContentAt(
				{ from: target, to: target + (editor.state.doc.nodeAt(target)?.nodeSize ?? 0) },
				{ type: 'mermaid', content: source ? [{ type: 'text', text: source }] : [] }
			)
			.run();
		return true;
	}

	export function completeDrawioConversion(suggestionId: SuggestionId, diagramId: DiagramId): void {
		if (!editor) throw new Error('The editor is not ready.');
		const completed = completePendingConversion(
			{
				state: editor.state,
				schema: editor.schema,
				dispatch: (transaction) => editor.view.dispatch(transaction)
			},
			suggestionId,
			diagramId
		);
		if (!completed) throw new Error('The pending draw.io conversion is no longer in this note.');
	}
</script>

{#snippet fallback(error: App.Error, reset: () => void)}
	<div
		class="flex min-h-96 flex-1 flex-col justify-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm"
		role="alert"
	>
		<p class="font-medium text-destructive">The editor stopped rendering this note.</p>
		<p class="text-muted-foreground">
			Your saved note is untouched — nothing was written while it was down. Try again, or reload the
			page if it keeps failing.
		</p>
		<p class="font-mono text-xs text-muted-foreground">{error.message}</p>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={reset}>Try again</Button>
			<Button variant="ghost" size="sm" onclick={() => location.reload()}>Reload the page</Button>
		</div>
	</div>
{/snippet}

{#if hydrated && editor}
	<!-- No `cursor-text` here: this wrapper is wider and taller than the editable
	     surface, so the I-beam extended into dead margin where clicking places no
	     caret. `.tiptap` declares it for the surface that actually takes text. -->
	<ContextMenu.Root>
		<ContextMenu.Trigger class="flex min-h-96 flex-1 flex-col">
			<!--
			The editor is the one surface where degrading quietly would be wrong: a
			node view that throws must not read as "the note is empty". State what
			happened and say the saved note is intact, because that is the question
			this failure raises.
		-->
			<ErrorBoundary label="the editor" {fallback}>
				<Tiptap {editor}>
					<!-- Mounted on <body> with fixed positioning: inside the editor DOM the
				     menu is clipped by the pane's scroll viewport whenever the selection
				     sits at the top edge. `scrollTarget` keeps the position in sync with the
				     pane's own scroller (the window doesn't fire for it). -->
					<BubbleMenu
						{editor}
						shouldShow={bubbleShouldShow}
						appendTo={() => window.document.body}
						options={{
							strategy: 'fixed',
							scrollTarget:
								editor.view.dom.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? window
						}}
						class="z-30 flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-none"
					>
						{#if activeAction}
							<ActionProgress
								icon={runningIcon[activeAction]}
								label={runningCopy[activeAction]}
								cancelling={actionCancelling}
								oncancel={oncancelaction}
							/>
						{:else}
							{#if onask}
								<!--
						The open-ended one, so it leads: the four beside it each do a single
						fixed thing, and this is the one that says the agent will take any
						instruction about the selection. Styled exactly like its neighbours —
						the bubble is already an AI cluster, so the tinted mark the agent
						carries elsewhere would only break the row's own consistency here.
					-->
								<Tip text="Open the chat with the selection attached">
									{#snippet children({ props })}
										<Button
											{...props}
											variant="ghost"
											size="sm"
											onmousedown={preserveEditorSelection}
											onclick={() => onask(agentActions.selection.prompt)}
										>
											<Suggestion class="size-4" />
											Ask about this
										</Button>
									{/snippet}
								</Tip>
								<Separator orientation="vertical" class="h-5" />
							{/if}
							<Tip text="Turn commitments in the selection into todos">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="sm"
										onmousedown={preserveEditorSelection}
										onclick={() => runSelectionAction('promises')}
									>
										<ClipboardCheck class="size-4" />
										Extract promises
									</Button>
								{/snippet}
							</Tip>
							<Tip text="Find related notes and propose backlinks">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="sm"
										onmousedown={preserveEditorSelection}
										onclick={() => runSelectionAction('relate')}
									>
										<Waypoints class="size-4" />
										Find related
									</Button>
								{/snippet}
							</Tip>
							<Tip text="Find supporting external references">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="sm"
										onmousedown={preserveEditorSelection}
										onclick={() => runSelectionAction('reference')}
									>
										<BookOpen class="size-4" />
										Reference
									</Button>
								{/snippet}
							</Tip>
							<Separator orientation="vertical" class="h-5" />
							<Tip text="Generate a mermaid diagram from the selection and insert it">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="sm"
										onmousedown={preserveEditorSelection}
										onclick={() => runSelectionAction('diagram')}
									>
										<Workflow class="size-4" />
										Diagram
									</Button>
								{/snippet}
							</Tip>
							{#if skills.length > 0 && onskill}
								<Separator orientation="vertical" class="h-5" />
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props: menuProps })}
											<Tip text="Run one of your skills on the selection">
												{#snippet children({ props: tipProps })}
													<Button {...mergeProps(menuProps, tipProps)} variant="ghost" size="sm">
														<Wrench class="size-4" />
														Skills
														<ChevronDown class="size-3" />
													</Button>
												{/snippet}
											</Tip>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start">
										{#each skills as skill (skill.noteId)}
											<DropdownMenu.Item onclick={() => onskill(skill.name)}>
												<Tip text={skill.description} side="right">
													{#snippet children({ props })}
														<span {...props}>{skill.name}</span>
													{/snippet}
												</Tip>
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						{/if}
					</BubbleMenu>
					<EdraEditor
						class="prose flex min-h-full max-w-none flex-1 flex-col pb-40 dark:prose-invert"
					/>
				</Tiptap>
				{#if activeLink}
					<ReferenceLinkPreview
						group={activeLink.group}
						anchor={activeLink.anchor}
						onretain={retainActiveLink}
						onurlchange={(url) => (activeLinkUrl = url)}
						onclose={scheduleActiveLinkClose}
					/>
					<div
						class="pointer-events-none fixed right-3 bottom-3 z-50 max-w-lg truncate rounded-sm border border-border bg-popover px-2 py-1 font-mono text-xs text-popover-foreground"
						role="status"
						aria-label={`Link destination: ${activeLinkUrl}`}
					>
						{activeLinkUrl}
					</div>
				{/if}
			</ErrorBoundary>
		</ContextMenu.Trigger>
		<ContextMenu.Content>
			<ContextMenu.Item onclick={() => void copySelectionRaw()}>Copy raw</ContextMenu.Item>
			<ContextMenu.Item onclick={() => void copySelectionFormatted()}>
				Copy with formatting
			</ContextMenu.Item>
			<ContextMenu.Separator />
			<ContextMenu.Item onclick={() => void pasteRaw()}>Paste raw</ContextMenu.Item>
			<ContextMenu.Item onclick={() => void pasteFormatted()}>
				Paste with formatting
			</ContextMenu.Item>
		</ContextMenu.Content>
	</ContextMenu.Root>
{:else}
	<div class="space-y-3">
		<Skeleton class="h-5 w-3/4" />
		<Skeleton class="h-5 w-full" />
		<Skeleton class="h-5 w-2/3" />
	</div>
{/if}
