<script lang="ts">
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { AgentModelDefaults } from '$lib/models/agent/model-label';
	import type { NoteView } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { parseTabId, type TabId } from '$lib/stores/workbench/tab-ref';
	import NotePane from './note-pane.svelte';
	import ChatPane from './chat-pane.svelte';
	import GlobalSearchPanel from '$lib/components/search/global-search-panel.svelte';
	import { DiagramPane } from '$lib/components/diagrams';

	let {
		tabId,
		shell,
		sessions,
		agentPreferences,
		agentModels,
		agentDefaults,
		agentAvailable,
		initialView,
		inlineSuggestionsEnabled = true,
		onCloseSplit
	}: {
		tabId: TabId;
		shell: ShellContext;
		sessions: readonly Conversation[];
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentDefaults: AgentModelDefaults;
		agentAvailable: boolean;
		initialView?: NoteView;
		inlineSuggestionsEnabled?: boolean;
		onCloseSplit?: () => void;
	} = $props();

	const ref = $derived(parseTabId(tabId));
</script>

<!--
	The pane host is kind-agnostic: it renders whatever a tab holds. Note panes
	keep their own component untouched, including the four per-note registries
	and the `data-note-pane` hook the split e2e selects on.
-->
{#if ref?.kind === 'chat'}
	<ChatPane
		sessionKey={ref.sessionKey}
		{shell}
		{sessions}
		{agentPreferences}
		{agentModels}
		{agentDefaults}
		{agentAvailable}
		{onCloseSplit}
	/>
{:else if ref?.kind === 'diagram'}
	<DiagramPane diagramId={ref.diagramId} {onCloseSplit} />
{:else if ref?.kind === 'search'}
	<div class="h-full overflow-hidden p-4">
		<GlobalSearchPanel projects={shell.projects} />
	</div>
{:else if ref?.kind === 'note'}
	<NotePane noteId={ref.noteId} {shell} {inlineSuggestionsEnabled} {initialView} {onCloseSplit} />
{/if}
