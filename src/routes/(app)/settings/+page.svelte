<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import SettingsPolicies from '$lib/components/app/pages/settings-policies.svelte';
	import SettingsModels from '$lib/components/app/pages/settings-models.svelte';
	import SettingsAgents from '$lib/components/app/pages/settings-agents.svelte';
	import SettingsMcp from '$lib/components/app/pages/settings-mcp.svelte';
	import SettingsTools from '$lib/components/app/pages/settings-tools.svelte';
	import type { ProjectId } from '$lib/models';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';
	import * as Tabs from '$lib/components/ui/tabs';

	let { data } = $props();

	// The tab lives in the URL so it survives reload and the `invalidateAll()`
	// that follows a trust-policy change.
	function selectTab(tab: string): void {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.set('tab', tab);
		void goto(`/settings?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	// Settings has no ambient project, so the scope the tool list is edited in
	// lives in the URL alongside the tab.
	const toolProjectId = $derived(
		(page.url.searchParams.get('project') ?? undefined) as ProjectId | undefined
	);

	function selectToolScope(projectId: string): void {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (projectId === 'all') params.delete('project');
		else params.set('project', projectId);
		void goto(`/settings?${params.toString()}`, { keepFocus: true, noScroll: true });
	}
</script>

<PageShell
	title="Settings"
	description="Agent defaults, the tools it may use, MCP access, and per-pipeline trust policies."
>
	{#snippet actions()}
		<AgentAction action={agentActions.settings} />
	{/snippet}
	<Tabs.Root value={data.tab} onValueChange={selectTab}>
		<Tabs.List variant="line">
			<Tabs.Trigger value="models">Models</Tabs.Trigger>
			<Tabs.Trigger value="agents">Agents</Tabs.Trigger>
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
				<SettingsModels preferences={data.preferences} models={data.models} />
			{/if}
		</Tabs.Content>
		<Tabs.Content value="agents" class="pt-6">
			{#if data.tab === 'agents'}
				<SettingsAgents preferences={data.preferences} defaults={data.defaults} />
			{/if}
		</Tabs.Content>
		<Tabs.Content value="tools" class="pt-6">
			{#if data.tab === 'tools'}
				<SettingsTools
					projects={data.projects}
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
				<SettingsPolicies policies={data.policies} />
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</PageShell>
