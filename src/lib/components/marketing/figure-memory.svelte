<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { FtCheck as Check, FtClose as Close } from '$lib/components/icons';
	import Surface from './surface.svelte';

	// Where fig. 1's date, constraint and owner actually came from. The proposed
	// row is live so the accept/reject gesture can be felt rather than described.
	const kept = [
		{
			kind: 'decision',
			text: 'The client brief reaches marketing before each sprint close.',
			when: 'kept 12 June'
		},
		{
			kind: 'constraint',
			text: 'No personal data in client-facing examples.',
			when: 'kept 12 June'
		},
		{
			kind: 'preference',
			text: 'Briefs are written in short declarative sentences.',
			when: 'kept 2 July'
		}
	];

	let proposal = $state<'proposed' | 'accepted' | 'rejected'>('proposed');
</script>

<Surface label="Acme rebrand · memory">
	<ul class="divide-y divide-border">
		{#each kept as entry (entry.text)}
			<li class="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-4">
				<span class="eyebrow w-24 shrink-0">{entry.kind}</span>
				<span class="min-w-0 flex-1 text-sm">{entry.text}</span>
				<span class="provenance-caption shrink-0">{entry.when}</span>
			</li>
		{/each}

		<li class="flex flex-col gap-3 border-l-2 border-l-brand bg-brand/6 px-5 py-4 dark:bg-brand/10">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
				<span class="eyebrow w-24 shrink-0">decision</span>
				<span class="min-w-0 flex-1 text-sm">Ana owns the client brief.</span>
				<span class="provenance-caption shrink-0">from the standup note</span>
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:pl-28">
				{#if proposal === 'proposed'}
					<Badge variant="secondary">Proposed</Badge>
					<Button size="xs" onclick={() => (proposal = 'accepted')}>
						<Check class="size-3.5" />
						Accept
					</Button>
					<Button size="xs" variant="ghost" onclick={() => (proposal = 'rejected')}>
						<Close class="size-3.5" />
						Reject
					</Button>
				{:else if proposal === 'accepted'}
					<Badge variant="brand">Kept</Badge>
					<span class="provenance-caption">Every agent on this project works from it now.</span>
					<Button size="xs" variant="ghost" onclick={() => (proposal = 'proposed')}>Undo</Button>
				{:else}
					<Badge variant="outline">Rejected</Badge>
					<span class="provenance-caption">Nothing was written.</span>
					<Button size="xs" variant="ghost" onclick={() => (proposal = 'proposed')}>Undo</Button>
				{/if}
			</div>
		</li>
	</ul>
</Surface>
