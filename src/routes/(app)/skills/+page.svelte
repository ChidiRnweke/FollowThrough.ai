<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import Pin from '@lucide/svelte/icons/pin';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { data } = $props();
</script>

<PageShell title="Skills" description="Reusable methodology the agent loads when a task matches.">
	{#if data.skills.length === 0}
		<p class="text-sm text-muted-foreground">
			No skills yet. Select a reusable structure in a note and save it as a skill.
		</p>
	{:else}
		<ul class="divide-y divide-border rounded-md border border-border">
			{#each data.skills as skill (skill.noteId)}
				<li>
					<a
						href="/skills/{skill.noteId}"
						class="row-interactive flex items-center gap-3 px-4 py-3"
					>
						<span
							class={[
								'size-2 shrink-0 rounded-full',
								skill.isEnabled ? 'bg-success' : 'bg-muted-foreground/40'
							]}
							title={skill.isEnabled ? 'Enabled' : 'Disabled'}
						></span>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-medium">{skill.name}</span>
								{#if skill.isPinned}
									<Pin class="size-3.5 shrink-0 text-muted-foreground" />
								{/if}
								{#if !skill.isEnabled}
									<Badge variant="ghost" class="shrink-0 text-muted-foreground">Disabled</Badge>
								{/if}
							</div>
							<p class="truncate text-sm text-muted-foreground">{skill.description}</p>
						</div>
						<div class="hidden shrink-0 items-center gap-1 lg:flex">
							{#each skill.triggerHints.slice(0, 3) as hint (hint)}
								<Badge variant="ghost" class="font-mono text-xs text-muted-foreground">{hint}</Badge
								>
							{/each}
						</div>
						<ChevronRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>
