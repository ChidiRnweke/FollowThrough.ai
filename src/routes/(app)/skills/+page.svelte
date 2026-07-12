<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	let { data } = $props();
</script>

<PageShell title="Skills" description="Your methodology, written down where the agent can use it.">
	{#if data.skills.length === 0}
		<p class="text-sm text-muted-foreground">
			No skills yet. Select a reusable structure in a note and save it as a skill.
		</p>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each data.skills as skill (skill.noteId)}
				<a href="/skills/{skill.noteId}" class="block">
					<Card.Root class="h-full gap-1 py-3 transition-colors hover:bg-accent">
						<Card.Header class="px-4">
							<Card.Title class="text-sm font-medium">{skill.name}</Card.Title>
							{#if !skill.isEnabled}
								<Card.Action>
									<Badge variant="ghost" class="text-muted-foreground">Disabled</Badge>
								</Card.Action>
							{/if}
						</Card.Header>
						<Card.Content class="space-y-1.5 px-4">
							<p class="text-sm text-muted-foreground">{skill.description}</p>
							<div class="flex flex-wrap gap-1">
								{#each skill.triggerHints as hint (hint)}
									<Badge variant="ghost" class="font-mono text-xs text-muted-foreground">
										{hint}
									</Badge>
								{/each}
							</div>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</PageShell>
