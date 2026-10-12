<script lang="ts">
	import { page } from '$app/state';
	import * as Icon from '$lib/components/icons';
	import AgentAction from '../agent/agent-action.svelte';
	import { chatStarters, starterSurface, type StarterTarget } from './chat-starters';

	let {
		hasNote,
		hasProject,
		prompts: offered,
		onpick
	}: {
		hasNote: boolean;
		hasProject: boolean;
		/** Questions handed over by an invocation point; they replace the surface's starters. */
		prompts?: readonly string[];
		onpick: (prompt: string) => void;
	} = $props();

	// Deliberately the same three icons the capability row above counts, so a row
	// and a stat that mean the same thing look the same.
	const icons: Record<StarterTarget, typeof Icon.Memory> = {
		notes: Icon.Document,
		todos: Icon.Todos,
		memory: Icon.Memory
	};

	const surface = $derived(starterSurface({ hasNote, hasProject, pathname: page.url.pathname }));
	const prompts = $derived(
		offered
			? offered.map((prompt) => ({ prompt, icon: Icon.Chat }))
			: chatStarters(surface).map((starter) => ({
					prompt: starter.prompt,
					icon: icons[starter.target]
				}))
	);
</script>

<!--
	The one group in an empty panel you are meant to act on, so it leads: an
	instruction above it rather than a description, rows at full foreground colour,
	and a tinted icon per row naming what the agent will change. The tint is the
	only colour in the group and it is doing work — it separates three actions from
	the plain history rows below, which is what the earlier all-grey list could not
	do. The heading still sits a step under `section-title`, which the type ladder
	reserves for the context sentence above.

	Weight is spent once, on that heading. The rows carry none: with the panel's
	orientation sentence already at semibold, bolding three rows under it left the
	whole group shouting and nothing standing out. Colour and the icons do the
	work instead.

	No box around the group: a card here would put a second surface inside a panel
	that already is one, and grouping is spacing and similarity by house rule.

	The rows themselves are `AgentAction` — the same component the invocation
	points across the app render. Arriving here from one of those buttons should
	look like arriving somewhere familiar, and sharing the markup is what keeps
	that true.
-->
<div class="flex flex-col gap-item">
	<p class="px-2 text-sm font-semibold">{offered ? 'Or ask' : 'Ask it to do something'}</p>
	<ul class="flex flex-col gap-bind">
		{#each prompts as starter (starter.prompt)}
			<li>
				<AgentAction
					variant="row"
					action={{ label: starter.prompt, prompt: starter.prompt, icon: starter.icon }}
					onclick={() => onpick(starter.prompt)}
				/>
			</li>
		{/each}
	</ul>
	{#if !offered}
		<!-- The agent also starts from a selection, which nothing in an empty chat shows. -->
		<p class="px-2 text-xs text-muted-foreground">
			Or select text in a note and choose Ask about this.
		</p>
	{/if}
</div>
