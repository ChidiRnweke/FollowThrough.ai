<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { FtCheck as Check, FtLoader as Loader } from '$lib/components/icons';
	import Surface from './surface.svelte';

	// Each line is a receipt for one thing the agent did. Three of the four are
	// lookups against the project rather than readings of the transcript.
	const steps = [
		{ doing: 'reading the project memory', done: 'read Acme rebrand memory', result: '6 entries' },
		{ doing: 'resolving “Friday”', done: 'resolved “Friday”', result: 'Fri 31 Jul' },
		{
			doing: 'checking constraints',
			done: 'matched a standing constraint',
			result: 'no personal data'
		},
		{ doing: 'extracting commitments', done: 'found 2 commitments', result: 'Ana, unassigned' }
	];

	// Server-rendering the finished panel made hydration snap it back to zero and
	// replay, which read as a flicker. So the resting state is nothing-yet-done,
	// which is legible on its own as a list of what the agent checks. Only a
	// hydrated client animates it.
	let resolved = $state(0);
	let playing = $state(false);

	const play: Attachment<HTMLElement> = () => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			resolved = steps.length;
			return;
		}

		playing = true;
		const timers = steps.map((_, index) =>
			setTimeout(
				() => {
					resolved = index + 1;
				},
				400 * (index + 1)
			)
		);
		return () => {
			timers.forEach(clearTimeout);
			playing = false;
		};
	};
</script>

<Surface label="2 · It checks what the project already knows">
	<ul {@attach play} class="divide-y divide-border">
		{#each steps as step, index (step.done)}
			{@const done = index < resolved}
			{@const active = playing && index === resolved}
			<li
				class="flex items-center gap-3 px-5 py-2.5 transition-opacity duration-(--duration-panel) ease-(--ease-standard)"
				class:opacity-40={playing && !done && !active}
			>
				{#if done}
					<Check class="size-4 shrink-0 text-brand" aria-hidden="true" />
				{:else if active}
					<Loader class="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
				{:else}
					<span class="size-4 shrink-0" aria-hidden="true"></span>
				{/if}

				<span class="min-w-0 flex-1 truncate text-sm">
					{done ? step.done : step.doing}{active ? '…' : ''}
				</span>

				{#if done}
					<span class="provenance-caption shrink-0 text-right">{step.result}</span>
				{/if}
			</li>
		{/each}
	</ul>
</Surface>
