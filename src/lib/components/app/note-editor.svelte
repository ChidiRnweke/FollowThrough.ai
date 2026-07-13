<script lang="ts">
	import { mount, unmount, untrack } from 'svelte';
	import type { NoteId, ProseMirrorDocument, SkillSummary } from '$lib/models';
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

	let {
		noteId,
		revision,
		document,
		skills = [],
		onchange,
		onaction,
		onskill
	}: {
		noteId: NoteId;
		revision: number;
		document: ProseMirrorDocument;
		skills?: readonly SkillSummary[];
		onchange?: () => void;
		onaction?: (action: NoteAiAction) => void;
		onskill?: (skillName: string) => void;
	} = $props();

	let initialized = false;
	const editor = createEditor(
		{
			onUpdate: () => {
				if (initialized) onchange?.();
			}
		},
		[TodoNode(TodoNodeView as never)]
	);

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
		editor.on('selectionUpdate', ({ editor: current }) => {
			const { from, to, empty } = current.state.selection;
			if (empty) {
				editorSelection.clear();
			} else {
				editorSelection.set({
					noteId,
					revision,
					from,
					to,
					text: current.state.doc.textBetween(from, to, ' ')
				});
			}
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

	export function focusStart(): void {
		editor?.commands.focus('start');
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

{#if editor}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="flex min-h-72 flex-1 cursor-text flex-col"
		onclick={() => {
			if (!editor.isFocused) editor.commands.focus('end');
		}}
	>
		<Tiptap {editor}>
			<BubbleMenu
				{editor}
				class="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-none"
			>
				<Button
					variant="ghost"
					size="sm"
					title="Turn commitments in the selection into todos"
					onclick={() => onaction?.('promises')}
				>
					<ClipboardCheck class="size-4" />
					Extract promises
				</Button>
				<Button
					variant="ghost"
					size="sm"
					title="Find related notes and propose backlinks"
					onclick={() => onaction?.('relate')}
				>
					<Waypoints class="size-4" />
					Find related
				</Button>
				<Button
					variant="ghost"
					size="sm"
					title="Find supporting external references"
					onclick={() => onaction?.('reference')}
				>
					<BookOpen class="size-4" />
					Reference
				</Button>
				<Separator orientation="vertical" class="h-5" />
				<Button
					variant="ghost"
					size="sm"
					title="Generate a mermaid diagram from the selection and insert it"
					onclick={() => onaction?.('diagram')}
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
			<EdraEditor class="prose flex max-w-none flex-1 flex-col dark:prose-invert" />
		</Tiptap>
	</div>
{:else}
	<div class="space-y-3">
		<Skeleton class="h-5 w-3/4" />
		<Skeleton class="h-5 w-full" />
		<Skeleton class="h-5 w-2/3" />
	</div>
{/if}
