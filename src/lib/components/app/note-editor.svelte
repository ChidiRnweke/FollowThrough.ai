<script lang="ts">
	import { mount, onMount, unmount, untrack } from 'svelte';
	import { getTextBetween, getTextSerializersFromSchema } from '@tiptap/core';
	import type { NoteId, ProseMirrorDocument, SkillSummary, TextSelection } from '$lib/models';
	import { createEditor } from '$lib/components/edra/commands/editor.js';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import Tiptap from '$lib/components/edra/Tiptap.svelte';
	import EdraEditor from '$lib/components/edra/editor.svelte';
	import BubbleMenu from '$lib/components/edra/BubbleMenu.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Waypoints from '@lucide/svelte/icons/waypoints';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Workflow from '@lucide/svelte/icons/workflow';
	import Wrench from '@lucide/svelte/icons/wrench';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import {
		createSuggestionAnchorPlugin,
		suggestionAnchorKey,
		SUGGESTION_ANCHOR_REBUILD,
		type AnchoredSuggestion
	} from './suggestion-anchor-plugin';
	import SuggestionInlineWidget from './suggestion-inline-widget.svelte';
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
		document,
		skills = [],
		onchange,
		onaction,
		onskill,
		onreviseMermaid
	}: {
		noteId: NoteId;
		revision: number;
		document: ProseMirrorDocument;
		skills?: readonly SkillSummary[];
		onchange?: () => void;
		onaction?: (action: NoteAiAction, selection?: TextSelection, insertAt?: number) => void;
		onskill?: (skillName: string) => void;
		onreviseMermaid: (
			source: string,
			instruction: string
		) => Promise<{ readonly source: string; readonly title?: string }>;
	} = $props();

	let initialized = false;
	let hydrated = $state(false);
	const editor = createEditor(
		{
			ariaLabel: 'Note body',
			onReviseMermaid: (source, instruction) => onreviseMermaid(source, instruction),
			onUpdate: () => {
				if (initialized) onchange?.();
			}
		},
		[TodoNode(TodoNodeView as never)]
	);

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
	onMount(() => {
		hydrated = true;
	});

	// Pending suggestions whose source text can be highlighted inline.
	const anchored: readonly AnchoredSuggestion[] = $derived(
		suggestionTray.items.flatMap((item) =>
			item.anchor && item.suggestion.noteId === noteId && item.suggestion.status === 'proposed'
				? [{ id: item.suggestion.id, kind: item.suggestion.kind, quote: item.anchor.quote }]
				: []
		)
	);

	if (editor) {
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
					const instance = mount(SuggestionInlineWidget, { target, props: { suggestionId } });
					return { dom: target, destroy: () => void unmount(instance) };
				}
			})
		);
		editor.on('selectionUpdate', () => {
			const selection = readSelection();
			if (selection) editorSelection.set(selection);
			else editorSelection.clear();
		});
	}

	// Rebuild highlights whenever the anchored suggestion set changes. The dispatch
	// must stay untracked: it mutates editor state, which would re-trigger this effect.
	$effect(() => {
		void anchored;
		if (!editor) return;
		untrack(() =>
			editor.view.dispatch(
				editor.view.state.tr.setMeta(suggestionAnchorKey, SUGGESTION_ANCHOR_REBUILD)
			)
		);
	});

	export function getDocument(): ProseMirrorDocument {
		return (editor?.getJSON() ?? { type: 'doc', content: [] }) as unknown as ProseMirrorDocument;
	}

	export function getPlainText(): string {
		return editor?.getText({ blockSeparator: '\n\n' }) ?? '';
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
	<div class="flex min-h-96 flex-1 cursor-text flex-col">
		<Tiptap {editor}>
			<BubbleMenu
				{editor}
				class="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-none"
			>
				<Button
					variant="ghost"
					size="sm"
					title="Turn commitments in the selection into todos"
					onmousedown={preserveEditorSelection}
					onclick={() => runSelectionAction('promises')}
				>
					<ClipboardCheck class="size-4" />
					Extract promises
				</Button>
				<Button
					variant="ghost"
					size="sm"
					title="Find related notes and propose backlinks"
					onmousedown={preserveEditorSelection}
					onclick={() => runSelectionAction('relate')}
				>
					<Waypoints class="size-4" />
					Find related
				</Button>
				<Button
					variant="ghost"
					size="sm"
					title="Find supporting external references"
					onmousedown={preserveEditorSelection}
					onclick={() => runSelectionAction('reference')}
				>
					<BookOpen class="size-4" />
					Reference
				</Button>
				<Separator orientation="vertical" class="h-5" />
				<Button
					variant="ghost"
					size="sm"
					title="Generate a mermaid diagram from the selection and insert it"
					onmousedown={preserveEditorSelection}
					onclick={() => runSelectionAction('diagram')}
				>
					<Workflow class="size-4" />
					Diagram
				</Button>
				{#if skills.length > 0 && onskill}
					<Separator orientation="vertical" class="h-5" />
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="sm"
									title="Run one of your skills on the selection"
								>
									<Wrench class="size-4" />
									Skills
									<ChevronDown class="size-3" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{#each skills as skill (skill.noteId)}
								<DropdownMenu.Item title={skill.description} onclick={() => onskill(skill.name)}>
									{skill.name}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			</BubbleMenu>
			<EdraEditor class="prose flex min-h-full max-w-none flex-1 flex-col dark:prose-invert" />
		</Tiptap>
	</div>
{:else}
	<div class="space-y-3">
		<Skeleton class="h-5 w-3/4" />
		<Skeleton class="h-5 w-full" />
		<Skeleton class="h-5 w-2/3" />
	</div>
{/if}
