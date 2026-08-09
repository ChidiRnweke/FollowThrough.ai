<script lang="ts">
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { NoteView } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { parseTabId, type TabId } from '$lib/stores/workbench/tab-ref';
	import NotePane from './note-pane.svelte';
	import ChatPane from './chat-pane.svelte';

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
{:else if ref?.kind === 'note'}
	<NotePane noteId={ref.noteId} {shell} {inlineSuggestionsEnabled} {initialView} {onCloseSplit} />
{/if}
