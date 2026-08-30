<script lang="ts">
	import { mount, onMount, unmount, untrack } from 'svelte';
	import { getTextBetween, getTextSerializersFromSchema, isTextSelection } from '@tiptap/core';
	import type { BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu';
	import {
		Plugin,
		PluginKey,
		TextSelection as PmTextSelection,
		type EditorState
	} from '@tiptap/pm/state';
	import { Decoration, DecorationSet } from '@tiptap/pm/view';
	import type { Diagram, DiagramId, DiagramSuggestion } from '$lib/models/diagrams';
	import { inlineSuggestionSchema, type AgentRunId } from '$lib/models/agent';
	import {
		parseProseMirrorDocument,
		type NoteId,
		type NoteLinkTarget,
		type OutlineHeading,
		type OutlineOffset,
		type ProseMirrorDocument,
		type TextSelection
	} from '$lib/models/notes';
	import { activeHeadingAt, outlineFrom } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import { ProjectDiagramPicker } from '$lib/components/diagrams';
	import { revealHeading } from '$lib/components/edra/commands/HeadingLinkSuggestion.js';
	import { changedTopLevelBlockIndices } from '$lib/models/notes/note-shimmer';
	import type { ReferenceView } from '$lib/models/references';
	import type { SkillSummary } from '$lib/models/skills';
	import type { SuggestionId } from '$lib/models/suggestions';
	import { createEditor } from '$lib/components/edra/commands/editor.js';
	import { toEditorContent } from './editor-document';
	import { completePendingConversion } from '$lib/components/edra/commands/diagram-references.js';
	import { rankNoteLinkTargets } from '$lib/components/edra/commands/NoteLinkSuggestion.js';
	import type { InlineSuggestionRequestInput } from '$lib/components/edra/commands/InlineSuggestion.js';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import type { Editor, PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
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
	import ProofreadMenu from './proofread-menu.svelte';
	import {
		createReferenceLinkPlugin,
		referenceLinkKey,
		REFERENCE_LINK_REBUILD,
		type AnchoredReferenceLink,
		type ResolvedReferenceLinkGroup
	} from './reference-link-plugin';
	import { createSelectionActionPlugin, selectionActionKey } from './selection-action-plugin';
	import { createSearchRevealPlugin, searchRevealKey } from './search-reveal-plugin';
	import type { SearchRevealRange } from './search-reveal-plugin';
	import {
		createPendingInsertionsPlugin,
		getPendingInsertion,
		holdPendingInsertion,
		pendingInsertionsKey,
		releasePendingInsertion
	} from './pending-insertions-plugin';
	import TodoNodeView from '../todos/todo-node.svelte';
	import { toast } from 'svelte-sonner';
	import {
		selectRange,
		selectionClipboardItem,
		selectionMarkdown,
		selectionPlainText,
		type SelectedRange
	} from '$lib/components/edra/commands/clipboard-payload';
	import NoteReadingStats from './note-reading-stats.svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import ActionProgress from '$lib/components/shared/action-progress.svelte';
	import { uploadNoteAttachment } from './attachment-upload';
	import { plainTextRangeToPm } from '$lib/components/edra/commands/plain-text-range';
	import {
		proofreadSelection,
		type ProofreadSelection
	} from '$lib/components/edra/commands/Proofread.js';
	import { proofreading } from '$lib/stores/notes/proofreading.svelte';
	import { dictionaryWordFor } from '$lib/models/proofreading';
	import { noteReveal } from '$lib/stores/notes/note-reveal.svelte';
	import type { NoteRevealMatch } from '$lib/stores/notes/note-reveal.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import { SEARCH_TAB_ID } from '$lib/stores/workbench/tab-ref';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';

	export type NoteAiAction = 'promises' | 'relate' | 'reference' | 'diagram';
	const BLOCK_SEPARATOR = '\n\n';
	/** Long enough for the ripple to finish; short enough that a second update can follow. */
	const SHIMMER_DURATION = 4500;
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
		projectId,
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
		onInsertionPointMoved,
		diagrams = [],
		activeAction,
		actionCancelling = false,
		oncancelaction,
		oncancelmermaid,
		onoutline,
		onactiveheading
	}: {
		noteId: NoteId;
		/** Scopes the project-diagram picker: a note only renders its own project's diagrams. */
		projectId: ProjectId;
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
		/** Each remap of a pending diagram's insert point, so the parent can persist it. */
		onInsertionPointMoved?: (runId: AgentRunId, position: number) => void;
		/** The AI selection action running against this note, if any. */
		activeAction?: NoteAiAction;
		/** True once its cancellation was requested but the run has not settled. */
		actionCancelling?: boolean;
		oncancelaction?: () => void;
		/** Stops a revision or conversion started from a mermaid node in this note. */
		oncancelmermaid?: (kind: 'revise' | 'convert') => void;
		/** The note's headings whenever the document structure changes. */
		onoutline?: (headings: readonly OutlineHeading[]) => void;
		/**
		 * The heading the reader is currently under, as the pane scrolls. Separate
		 * from `onoutline` because it changes on scroll, which fires no transaction.
		 */
		onactiveheading?: (id: string | undefined) => void;
	} = $props();

	let initialized = false;
	let hydrated = $state(false);
	/** Guards the shimmer teardown: only the latest replacement removes its decoration. */
	let shimmerGeneration = 0;
	/** Whether this editor is currently showing a search-reveal wash. */
	let revealActive = $state(false);
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
			if (!response.ok) throw new Error(`Writing suggestion failed with status ${response.status}`);
			const result = inlineSuggestionSchema.parse(await response.json());
			return result.outcome === 'suggested' ? { text: result.text } : { text: '' };
		} catch (error) {
			if (signal.aborted) return { text: '' };
			throw error;
		}
	}

	/**
	 * Where each heading sits inside the pane's scrollport, and which one the
	 * reader is under.
	 *
	 * Measured here rather than taken from the table-of-contents extension: its
	 * own tracking compares against `offsetTop`, which is relative to the
	 * absolutely positioned pane layer rather than the scroll container, and it
	 * cannot see the sticky note header. Kept as a plain array, not `$state` —
	 * it is only ever read from event handlers, and a scroll-rate proxy write
	 * would be pure overhead.
	 */
	let headingOffsets: readonly OutlineOffset[] = [];
	let measureFrame = 0;
	let lastActiveHeading: string | undefined;

	const paneViewport = (): HTMLElement | null =>
		editor?.view.dom.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;

	/** The line down the pane at which a heading counts as the section you are in. */
	const activationLine = (): number => {
		const dom = editor?.view.dom;
		if (!dom) return 0;
		const header = getComputedStyle(dom).getPropertyValue('--note-header-h');
		return (Number.parseFloat(header) || 0) + 24;
	};

	function measureHeadings(): void {
		const dom = editor?.view.dom;
		const viewport = paneViewport();
		// A pane in a background tab stays mounted but renders at zero size, so
		// every rect would be zero. The ResizeObserver re-measures when it returns.
		if (!dom || !viewport || !dom.isConnected || dom.offsetParent === null) return;
		const origin = viewport.getBoundingClientRect().top - viewport.scrollTop;
		headingOffsets = [...dom.querySelectorAll<HTMLElement>('[data-toc-id]')].map((heading) => ({
			id: heading.getAttribute('data-toc-id') ?? '',
			top: heading.getBoundingClientRect().top - origin
		}));
		reportActiveHeading();
	}

	function reportActiveHeading(): void {
		const viewport = paneViewport();
		if (!viewport) return;
		const active = activeHeadingAt(headingOffsets, viewport.scrollTop + activationLine());
		if (active === lastActiveHeading) return;
		lastActiveHeading = active;
		onactiveheading?.(active);
	}

	/** Coalesced: a structure change can arrive many times per keystroke. */
	function queueMeasure(): void {
		if (typeof requestAnimationFrame === 'undefined' || measureFrame) return;
		measureFrame = requestAnimationFrame(() => {
			measureFrame = 0;
			measureHeadings();
		});
	}

	/** Jump to a heading. Exported so the outline rail can drive the editor. */
	let pickingProjectDiagram = $state(false);

	/** Inserts the chosen diagram at the caret as a live reference. */
	function insertProjectDiagram(diagramId: DiagramId): void {
		editor?.chain().focus().setDrawio(diagramId).run();
	}

	export function scrollToHeading(id: string): void {
		if (editor && !editor.isDestroyed) revealHeading(editor.view.dom, id);
	}

	const editor = createEditor(
		{
			ariaLabel: 'Note body',
			onTocUpdate: (headings) => {
				onoutline?.(outlineFrom(headings));
				queueMeasure();
			},
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
			resolveDrawioHref: (reference) => `/diagrams/${reference}`,
			onPickProjectDiagram: () => (pickingProjectDiagram = true),
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
			// The dictionary is applied here rather than left to the checker: Harper's
			// own copy only takes effect on the next pass, and the block the caret sits
			// in is not re-linted until the writer stops typing — so a word they just
			// added would stay underlined until they paused.
			proofread: async (text) => proofreading.accepted(await proofreading.linter().lint(text)),
			proofreadEnabled: proofreading.enabled,
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
		[TodoNode(TodoNodeView)]
	);
	$effect(() => {
		editor?.commands.setInlineSuggestionsEnabled(inlineSuggestionsEnabled);
	});
	$effect(() => {
		editor?.commands.setProofreadEnabled(proofreading.enabled);
	});
	// Attach per-note stores so TipTap NodeViews (TodoNode, SuggestionInlineWidget)
	// can resolve the right note's todos/suggestions without going through a
	// singleton that would describe only the focused pane.
	$effect(() => {
		if (editor) editor.perNote = perNote;
	});

	/**
	 * True only for the instant the blur handler below collapses the selection itself, so
	 * `selectionUpdate` can tell that transaction apart from the author moving the caret.
	 */
	let holdingSelection = false;

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
	 * The proofreading issue whose menu is open. Mirrored into `$state` from the
	 * plugin because `editor.state` is a plain field: the transaction hook is the
	 * only thing that tells Svelte a decoration was clicked.
	 */
	let proofreadIssue = $state<ProofreadSelection | undefined>(undefined);
	$effect(() => {
		const instance = editor;
		if (!instance) return;
		const sync = () => {
			proofreadIssue = proofreadSelection(instance.view.state);
		};
		instance.on('transaction', sync);
		sync();
		return () => {
			instance.off('transaction', sync);
		};
	});

	/** The word this issue would teach the dictionary, if it is one it can answer. */
	const proofreadWord = $derived(proofreadIssue && dictionaryWordFor(proofreadIssue.issue));

	function applyProofreadFix(replacement: string): void {
		if (!editor || !proofreadIssue) return;
		const { from, to } = proofreadIssue;
		editor.commands.applyProofreadSuggestion(from, to, replacement);
		editor.commands.focus();
	}

	function learnProofreadWord(): void {
		if (!editor || !proofreadWord) return;
		proofreading.addWord(proofreadWord);
		editor.commands.dismissProofreadSelection();
		// The text is unchanged, so nothing else would trigger a re-check and the
		// underline the reader just dismissed would sit there until they typed.
		editor.commands.refreshProofread();
		editor.commands.focus();
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

	/**
	 * The range the context menu was opened over.
	 *
	 * By the time a menu item is clicked the editor's own selection is usually gone. A
	 * right-click that lands anywhere but on the selection collapses it to a caret before
	 * the menu even opens, and opening the menu moves focus off the contenteditable — so
	 * every copy read an empty selection and silently put nothing on the clipboard. The
	 * range is taken at `contextmenu`, ahead of both, and re-applied when an item runs.
	 */
	let contextRange = $state<SelectedRange | undefined>(undefined);

	function rememberContextRange(): void {
		const selection = editor?.view.state.selection;
		contextRange =
			selection && !selection.empty ? { from: selection.from, to: selection.to } : undefined;
	}

	/** The state a copy serializes from, or undefined when there is nothing to copy. */
	function copySource(): EditorState | undefined {
		if (!editor) return undefined;
		const state = selectRange(editor.view.state, contextRange);
		return state.selection.empty ? undefined : state;
	}

	async function copySelectionMarkdown(): Promise<void> {
		const state = copySource();
		if (!state) return;
		try {
			// A node the Markdown serializer has no syntax for still has text worth carrying,
			// and an empty clipboard is indistinguishable from a copy that never happened.
			const text = selectionMarkdown(state) || selectionPlainText(state);
			if (!text) {
				toast.error('The selection could not be copied');
				return;
			}
			await navigator.clipboard.writeText(text);
			// audit-allow: silent-catch — clipboard write failure is reported while the source text remains selected.
		} catch {
			toast.error('The clipboard could not be written');
		}
	}

	async function copySelectionFormatted(): Promise<void> {
		const state = copySource();
		if (!state) return;
		// A direct call, not a `copy` event, so it misses the editor's own handler —
		// it shares the payload builder instead, and pastes the same pictures.
		try {
			await navigator.clipboard.write([selectionClipboardItem(state)]);
			// audit-allow: silent-catch — formatted clipboard write failure is reported while the selection remains intact.
		} catch {
			toast.error('The clipboard could not be written');
		}
	}

	/**
	 * Puts the remembered range back on the view, so a paste from this menu replaces what
	 * was selected rather than landing at the caret the menu left behind.
	 */
	function restoreContextRange(): void {
		if (!editor || !contextRange) return;
		const restored = selectRange(editor.view.state, contextRange);
		if (restored.selection.empty) return;
		editor.view.dispatch(editor.view.state.tr.setSelection(restored.selection));
	}

	async function pasteRaw(): Promise<void> {
		if (!editor) return;
		try {
			const text = await navigator.clipboard.readText();
			if (!text) return;
			editor.view.focus();
			restoreContextRange();
			editor.view.pasteText(text);
			// audit-allow: silent-catch — clipboard read failure is reported and the document is not changed.
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
			restoreContextRange();
			editor.view.pasteHTML(html);
			// audit-allow: silent-catch — formatted clipboard read failure is reported and the document is not changed.
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

	// What the run store last saw for each pending insertion point, so the
	// transaction listener only reports actual movement, not every keystroke.
	let lastReportedInsertionPoint: Record<string, number> = {};

	$effect(() => {
		anchoredSnapshot = anchored;
		linkedReferencesSnapshot = linkedReferences;
		revisionSnapshot = revision;
	});

	onMount(() => {
		if (!editor) return;

		// Initial content only; the page remounts per note via {#key}.
		editor.commands.setContent(toEditorContent(untrack(() => document)));
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
		editor.registerPlugin(createSearchRevealPlugin());
		editor.registerPlugin(createPendingInsertionsPlugin());
		// Keep the run store's context on the mapped position, so a refresh while the
		// author is still typing lands the diagram where the text is, not where it was.
		editor.on('transaction', () => {
			const points = pendingInsertionsKey.getState(editor.state);
			if (!points) return;
			for (const [runId, point] of Object.entries(points)) {
				if (typeof point === 'number' && point !== lastReportedInsertionPoint[runId]) {
					lastReportedInsertionPoint[runId] = point;
					onInsertionPointMoved?.(runId as AgentRunId, point);
				}
			}
		});
		editor.on('selectionUpdate', () => {
			// The collapse below is this component's doing, not the author's, and the passage
			// they highlighted is still the one attached to whatever they are typing next.
			if (holdingSelection) return;
			const selection = readSelection();
			if (selection) perNote?.selection.set(selection);
			else perNote?.selection.clear();
		});
		// Clicking away deselects. The bubble menu only re-evaluates its visibility
		// on a selection or document change, so a blur without a transaction would
		// leave the stale bar floating over nothing; collapsing the selection both
		// matches what the author sees and forces the menu to re-evaluate. Skipped
		// while an action runs, because the running status rides the same menu.
		//
		// The wash is what the collapse would otherwise cost: clicking into the chat is how
		// you use a highlighted passage, and both the highlight and the chip standing for it
		// used to vanish on the way there. The passage stays lit, and stays attached, until
		// the author comes back and puts the caret somewhere.
		// `isDestroyed` first: a blur fires as the view is torn down, and by then reading
		// `activeAction` — a prop, and so a derived — would warn about a destroyed effect.
		editor.on('blur', () => {
			if (editor.isDestroyed || activeAction !== undefined) return;
			const { doc, selection } = editor.state;
			if (selection.empty) return;
			const { from, to } = selection;
			holdingSelection = true;
			editor.view.dispatch(
				editor.view.state.tr
					.setSelection(PmTextSelection.create(doc, from))
					.setMeta(selectionActionKey, { from, to, variant: 'held' })
			);
			holdingSelection = false;
		});
		// Back in the editor: the caret is about to say where the author actually is, so the
		// held wash has nothing left to stand in for. An action's own wash is not ours to
		// release — it outlives focus by design.
		editor.on('focus', () => {
			if (editor.isDestroyed || activeAction !== undefined) return;
			editor.view.dispatch(editor.view.state.tr.setMeta(selectionActionKey, null));
		});
		hydrated = true;
		return retainActiveLink;
	});

	// Track the reader's position down the note. The scroll listener sits on the
	// pane's ScrollArea viewport rather than the window — the window never scrolls
	// here — and the observer catches the reflows that move headings without any
	// scrolling at all: images and diagrams settling, or a background pane being
	// promoted and gaining a size for the first time.
	$effect(() => {
		if (!hydrated) return;
		let disposed = false;
		let poll = 0;
		let frame = 0;
		let detach: (() => void) | undefined;

		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				reportActiveHeading();
			});
		};

		// `EditorContent` moves the editor DOM into the pane in an effect of its
		// own, which can settle after this one — so the viewport is often still
		// out of reach on the first pass. Retry for a bounded stretch rather than
		// binding to nothing and going quiet for the editor's whole life.
		const attach = (framesLeft: number): void => {
			if (disposed) return;
			const viewport = paneViewport();
			const dom = editor?.view.dom;
			if (!viewport || !dom) {
				if (framesLeft > 0) poll = requestAnimationFrame(() => attach(framesLeft - 1));
				return;
			}
			viewport.addEventListener('scroll', onScroll, { passive: true });
			const observer = new ResizeObserver(() => queueMeasure());
			observer.observe(dom);
			detach = () => {
				viewport.removeEventListener('scroll', onScroll);
				observer.disconnect();
			};
			queueMeasure();
		};
		attach(120);

		return () => {
			disposed = true;
			detach?.();
			if (poll) cancelAnimationFrame(poll);
			if (frame) cancelAnimationFrame(frame);
			if (measureFrame) cancelAnimationFrame(measureFrame);
			measureFrame = 0;
		};
	});

	// Search click-through: once this editor is hydrated, a pending reveal for its note
	// lands on the match — selected, scrolled to, lit — and fires exactly once. The
	// request is consumed only once the view can actually show it: `EditorContent`
	// attaches the DOM in its own effect, which can settle after this one, and a
	// background tab's editor stays mounted under `display: none` — connected, but
	// scrollIntoView reads zeroed layout rects and the wash paints invisibly. The
	// click that sent the reveal also focuses the tab, flipping the pane visible
	// within a few frames; a detached twin (mounted and replaced during load) never
	// becomes visible, polls briefly, gives up, and leaves the request for the
	// visible instance.
	$effect(() => {
		const pending = noteReveal.pending;
		if (!hydrated || pending?.noteId !== noteId) return;
		untrack(() => {
			const attempt = (framesLeft: number): void => {
				if (!editor || editor.isDestroyed) return;
				const dom = editor.view.dom;
				if (!dom.isConnected || dom.offsetParent === null) {
					if (framesLeft > 0) requestAnimationFrame(() => attempt(framesLeft - 1));
					return;
				}
				const reveal = noteReveal.consume(noteId);
				if (reveal) revealPlainTextRange(reveal.start, reveal.end, reveal.text, reveal.others);
			};
			attempt(300);
		});
	});

	// The reveal wash stays as long as any search surface is open — the right panel in
	// search mode or the workbench search tab, like Word's Find pane keeping its hits
	// until the pane closes. Once none remains, release the decorations. `revealActive`
	// is state so a reveal that lands after the panel has already closed is released on
	// the next run rather than leaking.
	$effect(() => {
		if (!revealActive) return;
		const searching = rightPanel.mode === 'search' || workbench.openTabs.includes(SEARCH_TAB_ID);
		if (searching) return;
		untrack(() => {
			if (editor && !editor.isDestroyed)
				editor.view.dispatch(editor.state.tr.setMeta(searchRevealKey, null));
			revealActive = false;
		});
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

	/**
	 * Search click-through: select the clicked match, scroll it into view, and light every
	 * match in the note with a transient inline decoration — a decoration, not a mark, so
	 * nothing about the reveal is ever serialized into the document. The offsets describe
	 * the saved plain text; when unsaved keystrokes have shifted them, the matched text
	 * itself is the anchor, the same reconciliation `readSelection` uses.
	 */
	function revealPlainTextRange(
		start: number,
		end: number,
		text: string,
		others: readonly NoteRevealMatch[] = []
	): void {
		if (!editor) return;
		const plainText = editor.getText({ blockSeparator: BLOCK_SEPARATOR });
		const anchorPmRange = (match: NoteRevealMatch): SearchRevealRange | undefined => {
			let matchFrom = match.start;
			if (plainText.slice(match.start, match.end) !== match.text) {
				matchFrom = nearestTextOffset(plainText, match.text, match.start);
				if (matchFrom < 0) return undefined;
			}
			return plainTextRangeToPm(editor, matchFrom, matchFrom + match.text.length);
		};
		const range = anchorPmRange({ start, end, text });
		if (!range) return;
		const otherRanges = others
			.map(anchorPmRange)
			.filter((other) => other !== undefined)
			.filter(
				// A repeated query word can re-anchor onto the clicked match itself;
				// the primary decoration already covers it.
				(other) => other.from !== range.from || other.to !== range.to
			);
		if (range.from < 0 || range.to > editor.state.doc.content.size) return;
		editor.view.dispatch(
			editor.state.tr.setMeta(searchRevealKey, { primary: range, others: otherRanges })
		);
		editor.chain().setTextSelection(range).run();
		// ProseMirror's scrollIntoView is a no-op against the pane's ScrollArea
		// viewport; scroll the match's DOM into view natively instead.
		const at = editor.view.domAtPos(range.from);
		const element = at.node instanceof HTMLElement ? at.node : at.node.parentElement;
		element?.scrollIntoView({ block: 'center' });
		// The wash stays while any search surface is open — the right panel's search mode
		// or the workbench search tab, like Word's Find pane keeping its highlights until
		// the pane closes. The release effect below clears it once none remains.
		revealActive = true;
	}

	export function getDocument(): ProseMirrorDocument {
		return parseProseMirrorDocument(editor?.state.doc.toJSON() ?? { type: 'doc', content: [] });
	}

	export function getEditor(): Editor | undefined {
		return editor;
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
		editor.commands.setContent(toEditorContent(nextDocument));
		initialized = true;
		if (previousDocument) shimmerChangedBlocks(previousDocument, nextDocument);
	}

	export function focusStart(): void {
		editor?.commands.focus('start');
	}

	export function focusEnd(): void {
		editor?.commands.focus('end');
	}

	/** Records where a pending diagram run's node should be inserted. */
	export function holdInsertionPoint(runId: string, at: number): void {
		if (!editor) return;
		editor.view.dispatch(holdPendingInsertion(editor.state.tr, runId, at));
	}

	/**
	 * Where a pending diagram's node goes right now, and stops tracking it.
	 * `'lost'` means the location was deleted or replaced while the run was in
	 * flight; `undefined` means this editor never held it (e.g. after a refresh).
	 */
	export function consumeInsertionPoint(runId: string): number | 'lost' | undefined {
		if (!editor) return undefined;
		const point = getPendingInsertion(editor.state, runId);
		editor.view.dispatch(releasePendingInsertion(editor.state.tr, runId));
		return point;
	}

	/** Insert a mermaid diagram node at the given ProseMirror position, if it is valid. */
	export function insertMermaid(at: number, source: string): boolean {
		if (!editor) return false;
		// The captured position can be stale (the author kept typing while the run
		// was in flight): out of bounds positions throw on resolve, so bail out and
		// let the caller fall back to the suggestion tray.
		if (!Number.isFinite(at) || at < 0 || at > editor.state.doc.content.size) return false;
		try {
			editor
				.chain()
				.focus()
				.insertContentAt(at, {
					type: 'mermaid',
					content: source ? [{ type: 'text', text: source }] : []
				})
				.run();
			return true;
			// audit-allow: silent-catch — false is the typed decision outcome consumed by the suggestion UI, which keeps the action available.
		} catch {
			return false;
		}
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
		<!-- Before bits-ui's own handler, which focuses the menu and so collapses the
		     selection the items are about to act on. -->
		<ContextMenu.Trigger class="flex min-h-96 flex-1 flex-col" oncontextmenu={rememberContextRange}>
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
					{#if proofreadIssue}
						<ProofreadMenu
							{editor}
							selection={proofreadIssue}
							word={proofreadWord}
							onapply={applyProofreadFix}
							onlearn={learnProofreadWord}
						/>
					{/if}
					<EdraEditor
						class="prose flex min-h-full max-w-none flex-1 flex-col pb-40 dark:prose-invert"
					/>
					<!-- Yields the corner to the link destination, which is transient and more urgent. -->
					{#if !activeLink}
						<NoteReadingStats />
					{/if}
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
			<!-- Disabled rather than absent, so a right-click with nothing selected explains
			     itself instead of offering an item that would do nothing. -->
			<ContextMenu.Item
				disabled={contextRange === undefined}
				onclick={() => void copySelectionMarkdown()}
			>
				Copy as markdown
			</ContextMenu.Item>
			<ContextMenu.Item
				disabled={contextRange === undefined}
				onclick={() => void copySelectionFormatted()}
			>
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

<ProjectDiagramPicker bind:open={pickingProjectDiagram} {projectId} onpick={insertProjectDiagram} />
