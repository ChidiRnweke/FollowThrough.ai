<script lang="ts">
	import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import * as Icon from '$lib/components/icons';
	import MissedSearches from './missed-searches.svelte';
	import UnreadableFiles from './unreadable-files.svelte';
	import NeverUsedGrid from './never-used-grid.svelte';

	let { summary, projectId }: { summary: ProjectContextUsageSummary; projectId: ProjectId } =
		$props();

	const nothing = $derived(
		summary.missedSearches.length === 0 &&
			summary.hiddenAttachments.length === 0 &&
			summary.neverUsed.length === 0
	);
</script>

<!-- Most actionable first: a gap you can fill, then a file you can fix, then what sits idle. -->
{#if nothing}
	<EmptyState
		icon={Icon.Success}
		title="Nothing needs your attention."
		hint="Every file can be read, every search found something, and the agent has used everything here."
	/>
{:else}
	<div class="flex flex-col gap-12">
		{#if summary.missedSearches.length > 0}
			<MissedSearches searches={summary.missedSearches} {projectId} />
		{/if}
		{#if summary.hiddenAttachments.length > 0}
			<UnreadableFiles files={summary.hiddenAttachments} {projectId} />
		{/if}
		{#if summary.neverUsed.length > 0}
			<NeverUsedGrid items={summary.neverUsed} {projectId} />
		{/if}
	</div>
{/if}
