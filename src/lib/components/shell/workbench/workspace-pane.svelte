<script lang="ts">
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { NoteView } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { parseTabId, type TabId } from '$lib/stores/workbench/tab-ref';
	import NotePane from './note-pane.svelte';
	import ChatPane from './chat-pane.svelte';
	import GlobalSearchPanel from '$lib/components/search/global-search-panel.svelte';
	import { DiagramDraftPane, DiagramPane } from '$lib/components/diagrams';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { conversationProjectId } from '$lib/stores/diagrams/draft-project';

	let {
		tabId,
		shell,
		sessions,
		agentPreferences,
		agentModels,
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
		agentAvailable: boolean;
		initialView?: NoteView;
		inlineSuggestionsEnabled?: boolean;
		onCloseSplit?: () => void;
	} = $props();

	const ref = $derived(parseTabId(tabId));
	const draftConversation = $derived(
		ref?.kind === 'draft'
			? sessions.find(
					(conversation) => conversation.id === chatRegistry.peek(ref.sessionKey)?.conversationId
				)
			: undefined
	);
	const draftProjectId = $derived(
		ref?.kind === 'draft'
			? (conversationProjectId(draftConversation, shell.noteTree) ??
					diagramRegistry.draftProject(ref.sessionKey) ??
					workbench.activeProjectId)
			: undefined
	);
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
		{agentAvailable}
		{onCloseSplit}
	/>
{:else if ref?.kind === 'diagram'}
	<DiagramPane diagramId={ref.diagramId} {onCloseSplit} />
{:else if ref?.kind === 'draft'}
	<DiagramDraftPane
		sessionKey={ref.sessionKey}
		projectId={draftProjectId}
		projects={shell.projects}
		{onCloseSplit}
	/>
{:else if ref?.kind === 'search'}
	<div class="h-full overflow-hidden p-4">
		<GlobalSearchPanel projects={shell.projects} />
	</div>
{:else if ref?.kind === 'note'}
	<NotePane noteId={ref.noteId} {shell} {inlineSuggestionsEnabled} {initialView} {onCloseSplit} />
{/if}
