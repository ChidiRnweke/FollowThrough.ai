<script lang="ts">
	import { mount, onMount, unmount, untrack } from 'svelte';
	import { getTextBetween, getTextSerializersFromSchema } from '@tiptap/core';
	import type {
		Diagram,
		DiagramSuggestion,
		DrawioDiagram,
		NoteId,
		ProseMirrorDocument,
		ReferenceView,
		SkillSummary,
		SuggestionId,
		TextSelection
	} from '$lib/models';
	import { createEditor } from '$lib/components/edra/commands/editor.js';
	import type { InlineSuggestionRequestInput } from '$lib/components/edra/commands/InlineSuggestion.js';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import Tiptap from '$lib/components/edra/Tiptap.svelte';
	import EdraEditor from '$lib/components/edra/editor.svelte';
	import BubbleMenu from '$lib/components/edra/BubbleMenu.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import {
		FtCopied as ClipboardCheck,
		FtReferences as Waypoints,
		FtReading as BookOpen,
		FtWorkflow as Workflow,
		FtSkills as Wrench,
		FtSuggestion as Suggestion,
		FtChevronDown as ChevronDown
	} from '$lib/components/icons';
	import { agentActions } from './agent/agent-actions';
	import {
		createSuggestionAnchorPlugin,
		suggestionAnchorKey,
		SUGGESTION_ANCHOR_REBUILD,
		type AnchoredSuggestion
	} from './suggestion-anchor-plugin';
	import SuggestionInlineWidget from './suggestion-inline-widget.svelte';
	import ReferenceLinkPreview from './reference-link-preview.svelte';
	import {
		createReferenceLinkPlugin,
		referenceLinkKey,
		REFERENCE_LINK_REBUILD,
		type AnchoredReferenceLink,
		type ResolvedReferenceLinkGroup
	} from './reference-link-plugin';
	import TodoNodeView from './todo-node.svelte';

	export type NoteAiAction = 'promises' | 'relate' | 'reference' | 'diagram';
	const BLOCK_SEPARATOR = '\n\n';

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
		perNote,
		onchange,
		onaction,
		onskill,
		onask,
		onreviseMermaid,
		onconvertMermaid,
		onacceptDrawio,
		onrejectDrawio,
		diagrams = []
	}: {
		noteId: NoteId;
		revision: number;
		inlineSuggestionsEnabled?: boolean;
		document: ProseMirrorDocument;
		references?: readonly ReferenceView[];
		skills?: readonly SkillSummary[];
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
		onacceptDrawio: (
			suggestionId: SuggestionId,
			source: string,
			renderedSvg: string
		) => Promise<DrawioDiagram>;
		onrejectDrawio: (suggestionId: SuggestionId) => Promise<void>;
		diagrams?: readonly Diagram[];
	} = $props();

	let initialized = false;
	let hydrated = $state(false);
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
			onConvertMermaid: (source, instruction) => onconvertMermaid(source, instruction),
			getDrawioSuggestion: (suggestionId) => {
				const candidate = perNote?.suggestions.items.find(
					(item) => item.suggestion.id === suggestionId
				)?.suggestion;
				return candidate?.kind === 'diagram' && candidate.payload.kind === 'drawio'
					? candidate
					: undefined;
			},
			onAcceptDrawio: (suggestionId, source, renderedSvg) =>
				onacceptDrawio(suggestionId, source, renderedSvg),
			onRejectDrawio: (suggestionId) => onrejectDrawio(suggestionId),
			getDrawioDiagram: (diagramId) => {
				const candidate = diagrams.find((diagram) => diagram.id === diagramId);
				return candidate?.kind === 'drawio' ? candidate : undefined;
			},
			getNoteId: () => noteId,
			getInlineSuggestion: requestInlineSuggestion,
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
		onaction?.(action, readSelection(), editor?.state.selection.to);
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

	onMount(() => {
		if (!editor) return;

		// Initial content only; the page remounts per note via {#key}.
		editor.commands.setContent(untrack(() => document) as never);
		initialized = true;
		editor.registerPlugin(
			createSuggestionAnchorPlugin({
				getAnchored: () => anchored,
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
				getReferences: () => linkedReferences,
				getRevision: () => revision,
				onActivate: (group, anchor) => {
					retainActiveLink();
					activeLink = { group, anchor };
					activeLinkUrl = group.sources[0]?.url ?? '';
				},
				onDeactivate: scheduleActiveLinkClose
			})
		);
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

	export function getDocument(): ProseMirrorDocument {
		return (editor?.getJSON() ?? { type: 'doc', content: [] }) as unknown as ProseMirrorDocument;
	}

	export function getPlainText(): string {
		return editor?.getText({ blockSeparator: '\n\n' }) ?? '';
	}

	export function replaceDocument(nextDocument: ProseMirrorDocument): void {
		if (!editor) return;
		initialized = false;
		editor.commands.setContent(nextDocument as never);
		initialized = true;
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
</script>

{#if hydrated && editor}
	<!-- No `cursor-text` here: this wrapper is wider and taller than the editable
	     surface, so the I-beam extended into dead margin where clicking places no
	     caret. `.tiptap` declares it for the surface that actually takes text. -->
	<div class="flex min-h-96 flex-1 flex-col">
		<Tiptap {editor}>
			<BubbleMenu
				{editor}
				class="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-none"
			>
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
	</div>
{:else}
	<div class="space-y-3">
		<Skeleton class="h-5 w-3/4" />
		<Skeleton class="h-5 w-full" />
		<Skeleton class="h-5 w-2/3" />
	</div>
{/if}
