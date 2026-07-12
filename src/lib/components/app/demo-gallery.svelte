<script lang="ts">
	import type { NoteSummary, NoteView, SuggestionGroup, TodoView, TrustPolicy } from '$lib/models';
	import type { Snippet } from 'svelte';
	import { Separator } from '$lib/components/ui/separator';
	import BacklinkChip from './backlink-chip.svelte';
	import DiagramFrame from './diagram-frame.svelte';
	import KanbanBoard from './kanban-board.svelte';
	import NoteTree from './note-tree.svelte';
	import ReferenceCard from './reference-card.svelte';
	import SuggestionCard from './suggestion-card.svelte';
	import TodoCard from './todo-card.svelte';
	import TodoTable from './todo-table.svelte';
	import TrustPolicyControl from './trust-policy-control.svelte';

	let {
		todos,
		groups,
		policies,
		noteTree,
		noteView
	}: {
		todos: readonly TodoView[];
		groups: readonly SuggestionGroup[];
		policies: readonly TrustPolicy[];
		noteTree: readonly NoteSummary[];
		noteView: NoteView;
	} = $props();

	const suggestionViews = $derived(groups.flatMap((group) => group.suggestions));
	const unrendered = $derived(
		noteView.diagrams[0] ? { ...noteView.diagrams[0], renderedSvg: undefined } : undefined
	);
</script>

{#snippet section(name: string, body: Snippet)}
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-muted-foreground">{name}</h2>
		{@render body()}
	</section>
	<Separator />
{/snippet}

{#snippet todosBody()}
	<div class="grid gap-3 md:grid-cols-2">
		{#each todos as view (view.todo.id)}
			<TodoCard {view} onstatus={() => {}} onopen={() => {}} />
		{/each}
	</div>
{/snippet}

{#snippet suggestionsBody()}
	<div class="grid gap-3 md:grid-cols-2">
		{#each suggestionViews as view (view.suggestion.id)}
			<SuggestionCard {view} onaccept={() => {}} onreject={() => {}} />
		{/each}
	</div>
{/snippet}

{#snippet chipsBody()}
	<div class="flex flex-wrap items-center gap-2">
		{#each noteView.backlinks as backlink (backlink.relationship.id)}
			<BacklinkChip {backlink} />
		{/each}
	</div>
{/snippet}

{#snippet referencesBody()}
	<div class="grid gap-3 md:grid-cols-2">
		{#each noteView.references as reference (reference.id)}
			<ReferenceCard {reference} />
		{/each}
	</div>
{/snippet}

{#snippet diagramsBody()}
	<div class="grid gap-3 md:grid-cols-2">
		{#each noteView.diagrams as diagram (diagram.id)}
			<DiagramFrame {diagram} onedit={() => {}} onpromote={() => {}} onregenerate={() => {}} />
		{/each}
		{#if unrendered}
			<DiagramFrame diagram={unrendered} />
		{/if}
	</div>
{/snippet}

{#snippet policiesBody()}
	<div class="grid gap-3 md:grid-cols-2">
		{#each policies as policy (policy.pipeline)}
			<TrustPolicyControl {policy} onchange={() => {}} />
		{/each}
	</div>
{/snippet}

{#snippet kanbanBody()}
	<KanbanBoard {todos} onmove={() => {}} onopen={() => {}} />
{/snippet}

{#snippet tableBody()}
	<TodoTable {todos} onopen={() => {}} />
{/snippet}

{#snippet treeBody()}
	<div class="max-w-xs rounded-lg border border-border bg-sidebar p-2">
		<NoteTree notes={noteTree} />
	</div>
{/snippet}

{@render section('Kanban board (drag between columns)', kanbanBody)}
{@render section('Todo table', tableBody)}
{@render section('Note tree', treeBody)}
{@render section('Todo cards', todosBody)}
{@render section('Suggestion cards', suggestionsBody)}
{@render section('Backlink chips', chipsBody)}
{@render section('Reference cards', referencesBody)}
{@render section('Diagram frames', diagramsBody)}
{@render section('Trust policy controls', policiesBody)}
