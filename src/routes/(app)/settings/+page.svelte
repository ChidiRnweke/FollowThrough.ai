<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import {
		SettingsAgents,
		SettingsDocuments,
		SettingsMcp,
		SettingsModels,
		SettingsPolicies,
		SettingsTools
	} from '$lib/components/settings';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import * as Tabs from '$lib/components/ui/tabs';

	let { data } = $props();

	// Keep navigation state in the URL; resource updates come from the shared workspace.
	function selectTab(tab: string): void {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.set('tab', tab);
		void goto(`/settings?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	// Settings has no ambient project, so the scope the tool list is edited in
	// lives in the URL alongside the tab.
	const toolProjectId = $derived(data.projectId);

	function selectToolScope(projectId: string): void {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (projectId === 'all') params.delete('project');
		else params.set('project', projectId);
		void goto(`/settings?${params.toString()}`, { keepFocus: true, noScroll: true });
	}
</script>

<PageShell
	title="Settings"
	description="Agent defaults, document defaults, the tools it may use, MCP access, and per-pipeline trust policies."
>
	{#snippet actions()}
		<AgentAction action={agentActions.settings} />
	{/snippet}
	<Tabs.Root value={data.tab} onValueChange={selectTab}>
		<Tabs.List variant="line">
			<Tabs.Trigger value="models">Models</Tabs.Trigger>
			<Tabs.Trigger value="agents">Agents</Tabs.Trigger>
			<Tabs.Trigger value="documents">Documents</Tabs.Trigger>
			<Tabs.Trigger value="tools">Tools</Tabs.Trigger>
			<Tabs.Trigger value="mcp">MCP access</Tabs.Trigger>
			<Tabs.Trigger value="policies">Trust policies</Tabs.Trigger>
		</Tabs.List>
		<!-- Tabs.Content renders every panel and hides the inactive ones, so each
		     body is gated on the active tab: switching tabs is a `goto` that
		     re-runs `load` anyway, and this keeps the MCP panel's token query
		     from firing while you are on another tab. -->
		<Tabs.Content value="models" class="pt-6">
			{#if data.tab === 'models'}
				<SettingsModels models={data.session.bootstrap.agentModels} />
			{/if}
		</Tabs.Content>
		<Tabs.Content value="agents" class="pt-6">
			{#if data.tab === 'agents'}
				<SettingsAgents defaults={data.session.bootstrap.numericDefaults} />
			{/if}
		</Tabs.Content>
		<Tabs.Content value="documents" class="pt-6">
			{#if data.tab === 'documents'}
				<SettingsDocuments />
			{/if}
		</Tabs.Content>
		<Tabs.Content value="tools" class="pt-6">
			{#if data.tab === 'tools'}
				<SettingsTools
					projects={data.session.resources.views.projects}
					projectId={toolProjectId}
					onscopechange={selectToolScope}
				/>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="mcp" class="pt-6">
			{#if data.tab === 'mcp'}
				<SettingsMcp endpoint={data.mcpEndpoint} />
			{/if}
		</Tabs.Content>
		<Tabs.Content value="policies" class="pt-6">
			{#if data.tab === 'policies'}
				<SettingsPolicies />
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</PageShell>
