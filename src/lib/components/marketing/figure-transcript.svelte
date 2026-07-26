<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { FtCheck as Check, FtChevronDown as Down } from '$lib/components/icons';
	import Surface from './surface.svelte';
	import Carried from './carried.svelte';
	import AgentWorking from './agent-working.svelte';

	// Three stages, top to bottom, each labelled in plain second person so the
	// demo needs no caption underneath it.
	const transcript = [
		{
			name: 'Ana',
			text: 'Right, the client brief. Marketing needs it ',
			mark: 'Friday',
			tail: ' or it slips.'
		},
		{
			name: 'You',
			text: 'Fine. ',
			mark: 'Same constraint as last round',
			tail: '. Nothing with personal data.'
		},
		{ name: 'Ana', text: 'Agreed. And ', mark: 'nobody has picked up the deck', tail: ' yet.' },
		{ name: 'You', text: "I'll chase the deck. ", mark: 'Can you own the brief itself?', tail: '' },
		{ name: 'Ana', text: 'Yes.', mark: '', tail: '' }
	];
</script>

<div class="flex w-full max-w-3xl flex-col items-stretch gap-3">
	<Surface label="1 · You paste a meeting transcript" muted>
		<div class="flex flex-col gap-3.5 px-5 py-5">
			{#each transcript as line, index (index)}
				<p class="flex gap-3 text-sm leading-relaxed">
					<span
						class="w-11 shrink-0 font-medium {line.name === 'You'
							? 'text-foreground'
							: 'text-muted-foreground'}">{line.name}</span
					>
					<span class="min-w-0 text-muted-foreground">
						{line.text}{#if line.mark}<Carried>{line.mark}</Carried>{/if}{line.tail}
					</span>
				</p>
			{/each}
		</div>
	</Surface>

	<Down class="mx-auto size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

	<AgentWorking />

	<Down class="mx-auto size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

	<Surface label="3 · You keep a clean note">
		<div class="flex flex-col gap-5 px-5 py-5">
			<h3 class="font-serif text-2xl font-medium tracking-tight">Client brief standup</h3>
			<div class="flex flex-col gap-2">
				<p class="eyebrow">Decisions</p>
				<ul class="flex flex-col gap-1.5 text-sm leading-relaxed">
					<li>The brief reaches marketing by <Carried derived>Friday 31 July</Carried>.</li>
					<li>Examples stay free of personal data, <Carried>as in the previous round</Carried>.</li>
					<li><Carried derived>Ana owns the brief</Carried>.</li>
				</ul>
			</div>
			<div class="flex flex-col gap-2">
				<p class="eyebrow">Open</p>
				<ul class="flex flex-col gap-1.5 text-sm leading-relaxed">
					<li><Carried>The deck has no owner</Carried>.</li>
				</ul>
			</div>
		</div>
	</Surface>

	<Surface label="…and two todos it made for you">
		<ul class="divide-y divide-border">
			<li class="flex items-start gap-3 px-5 py-4">
				<span
					class="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border border-muted-foreground/40"
					aria-hidden="true"
				>
					<Check class="size-3 text-transparent" />
				</span>
				<div class="flex min-w-0 flex-col gap-2">
					<span class="text-sm font-medium">Send the client brief to marketing</span>
					<div class="flex flex-wrap items-center gap-1.5">
						<Badge variant="brand">Acme rebrand</Badge>
						<span
							class="inline-flex h-5 items-center rounded-4xl bg-brand/10 px-2 text-xs font-medium text-brand underline decoration-brand decoration-dotted decoration-2 underline-offset-4 dark:bg-brand/20"
							>Fri 31 Jul</span
						>
						<span class="provenance-caption">waiting on Ana</span>
					</div>
				</div>
			</li>
			<li class="flex items-start gap-3 px-5 py-4">
				<span
					class="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border border-muted-foreground/40"
					aria-hidden="true"
				>
					<Check class="size-3 text-transparent" />
				</span>
				<div class="flex min-w-0 flex-col gap-2">
					<span class="text-sm font-medium">Find an owner for the deck</span>
					<div class="flex flex-wrap items-center gap-1.5">
						<Badge variant="brand">Acme rebrand</Badge>
						<span class="provenance-caption">No date yet</span>
					</div>
				</div>
			</li>
		</ul>
	</Surface>

	<p class="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
		<span
			class="inline-block h-0 w-6 shrink-0 border-b-2 border-dotted border-brand"
			aria-hidden="true"
		></span>
		<span>Dotted means the agent worked it out. Nothing in the transcript says 31 July.</span>
	</p>
</div>
