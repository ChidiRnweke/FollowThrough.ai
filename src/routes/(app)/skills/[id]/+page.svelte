<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { formatDateTime } from '$lib/components/app/labels';
	import ActionForm from '$lib/components/primitives/action-form.svelte';

	let { data } = $props();
</script>

<PageShell title={data.view.skill.name} description={data.view.skill.description}>
	{#snippet actions()}
		<Button variant="outline" size="sm" href="/notes/{data.view.skill.note.id}">
			Edit as note
		</Button>
	{/snippet}
	<div class="flex flex-wrap gap-1.5">
		{#each data.view.skill.triggerHints as hint (hint)}
			<Badge variant="ghost" class="font-mono text-xs text-muted-foreground">{hint}</Badge>
		{/each}
		{#if !data.view.skill.isEnabled}
			<Badge variant="ghost" class="text-muted-foreground">Disabled</Badge>
		{/if}
	</div>
	<Separator />
	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold">Where the agent used it</h2>
		{#each data.view.usages as usage (usage.usage.id)}
			<div class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
				{#if usage.contextNote}
					<a href="/notes/{usage.contextNote.id}" class="hover:underline">
						{usage.contextNote.title}
					</a>
				{:else}
					<span class="text-muted-foreground">Chat session</span>
				{/if}
				<span class="text-xs text-muted-foreground">{formatDateTime(usage.usage.createdAt)}</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				Not used yet. It will be loaded when a prompt matches its trigger hints.
			</p>
		{/each}
	</section>
	<Separator />
	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold">Version history</h2>
		{#each [...data.versions].reverse() as version (version.id)}
			<div class="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
				<div>
					<p>Revision {version.revision}</p>
					<p class="text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</p>
				</div>
				{#if version.revision !== data.view.skill.note.currentRevision}
					<ActionForm action="?/restore">
						<Button variant="outline" size="sm" name="revision" value={version.revision}>
							Restore
						</Button>
					</ActionForm>
				{:else}
					<Badge variant="secondary">Current</Badge>
				{/if}
			</div>
		{/each}
	</section>
</PageShell>
