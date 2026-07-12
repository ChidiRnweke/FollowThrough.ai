<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { NoteView } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import { noteActions } from '$lib/stores/note-actions.svelte';
	import { noteTodos } from '$lib/stores/note-todos.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { suggestionToView } from '$lib/stores/suggestion-view';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import BacklinkChip from '../backlink-chip.svelte';
	import DiagramFrame from '../diagram-frame.svelte';
	import NoteEditor, { type NoteAiAction } from '../note-editor.svelte';
	import ReferenceCard from '../reference-card.svelte';

	let { view }: { view: NoteView } = $props();

	let editorRef = $state<NoteEditor | null>(null);
	let dirty = $state(false);

	const noteRef = $derived({ id: view.note.id, title: view.note.title });

	$effect(() => {
		noteTodos.replace(view.todos);
		suggestionTray.replace(view.pendingSuggestions);
		return () => {
			noteTodos.clear();
			editorSelection.clear();
		};
	});

	async function save(): Promise<void> {
		if (!editorRef || noteActions.saving) return;
		const output = await noteActions.save({ ...view.note, document: editorRef.getDocument() });
		if (output) {
			dirty = false;
			toast.success('Saved');
			await invalidateAll();
		} else {
			toast.error('Could not save the note. Try again.');
		}
	}

	async function runAction(action: NoteAiAction): Promise<void> {
		const selection = editorSelection.current;
		if (!selection || noteActions.running) {
			if (!selection) toast.error('Select some text first.');
			return;
		}
		if (action === 'promises') {
			const output = await noteActions.extractPromises(selection);
			if (!output) {
				toast.error('Extract Promises failed. Try again.');
				return;
			}
			suggestionTray.add(
				output.suggestions.map((s) => suggestionToView(s, 'extract_promises', noteRef))
			);
			if (output.createdTodos.length > 0) {
				toast.success(`${output.createdTodos.length} todo(s) created from explicit promises`);
				await invalidateAll();
			}
		} else if (action === 'relate') {
			const output = await noteActions.relate(selection);
			if (!output) {
				toast.error('Relate failed. Try again.');
				return;
			}
			suggestionTray.add(output.suggestions.map((s) => suggestionToView(s, 'relate', noteRef)));
		} else if (action === 'reference') {
			const output = await noteActions.findReferences(selection);
			if (!output) {
				toast.error('Reference failed. Try again.');
				return;
			}
			if (output.outcome === 'nothing_relevant') {
				toast.info('Nothing sufficiently relevant found.');
				return;
			}
			suggestionTray.add(output.suggestions.map((s) => suggestionToView(s, 'reference', noteRef)));
		} else {
			const output = await noteActions.generateDiagram(selection);
			if (!output) {
				toast.error('Diagram generation failed. Try again.');
				return;
			}
			suggestionTray.add([suggestionToView(output.suggestion, 'agent', noteRef)]);
		}
		rightPanel.openSuggestions();
	}

	function onkeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key === 's') {
			event.preventDefault();
			void save();
		}
	}
</script>

<svelte:window {onkeydown} />

<div class="flex flex-wrap items-center gap-1.5">
	{#each view.backlinks as backlink (backlink.relationship.id)}
		<BacklinkChip {backlink} direction={backlink.sourceNote.id === view.note.id ? 'out' : 'in'} />
	{/each}
	<div class="ml-auto flex items-center gap-2">
		{#if noteActions.running}
			<LoaderCircle class="size-4 animate-spin text-muted-foreground" />
		{/if}
		<Button
			size="sm"
			variant={dirty ? 'default' : 'outline'}
			disabled={noteActions.saving}
			onclick={save}
		>
			{noteActions.saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
		</Button>
	</div>
</div>

<NoteEditor
	bind:this={editorRef}
	noteId={view.note.id}
	revision={view.note.currentRevision}
	document={view.note.document}
	onchange={() => (dirty = true)}
	onaction={(action) => void runAction(action)}
/>

{#if view.diagrams.length > 0 || view.references.length > 0}
	<Separator />
	<div class="grid gap-3 lg:grid-cols-2">
		{#each view.diagrams as diagram (diagram.id)}
			<DiagramFrame {diagram} />
		{/each}
		{#each view.references as reference (reference.id)}
			<ReferenceCard {reference} />
		{/each}
	</div>
{/if}
