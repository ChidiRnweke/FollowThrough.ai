<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Attachment } from 'svelte/attachments';
	import { tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { Pause, Play } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { FtCheck as Check, FtLoader as Loader } from '$lib/components/icons';
	import Surface from './surface.svelte';
	import Carried from './carried.svelte';

	// One card, told as four beats: the paste morphs into the agent's checklist,
	// the checklist morphs into the clean note, and the todos slide in last. The
	// dotted derived marks need no legend — the checklist just showed "Friday"
	// becoming "Fri 31 Jul", and the marks land a beat after the note does,
	// which is the same fact shown instead of said.
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

	const labels = [
		'1 · You paste a meeting transcript',
		'2 · The agent checks what the project already knows',
		'3 · You keep a clean note',
		'…and two todos the agent made for you'
	];

	// SSR renders the final beat so no-JS readers see everything. A hydrated,
	// motion-allowed client starts at the paste and morphs when the card is
	// fully in view; the pills under the card jump to any beat.
	const FINAL = 3;
	let stage = $state(typeof window === 'undefined' ? FINAL : 0);
	let resolved = $state(0);
	let playing = $state(false);
	let paused = $state(false);

	// Every scheduled beat lives in `timers` so one clear stops the sequence —
	// that is what pause, and jumping with the pills, both rely on.
	let timers: ReturnType<typeof setTimeout>[] = [];
	const later = (fn: () => void, ms: number) => {
		timers.push(setTimeout(fn, ms));
	};
	const clearTimers = () => {
		timers.forEach(clearTimeout);
		timers = [];
	};

	let bodyEl: HTMLDivElement | undefined = $state();
	let height = $state('');

	// Outgoing and incoming beats share one grid cell while they crossfade; the
	// wrapper's height is animated between the two so the card itself morphs
	// instead of jumping. Beats 2→3 stay on the same page (the todos slide in),
	// so no height work is needed there.
	async function morphTo(next: number) {
		const samePage = stage >= 2 && next >= 2;
		const from = samePage || !bodyEl ? 0 : bodyEl.offsetHeight;
		stage = next;
		if (samePage || !bodyEl) return;
		await tick();
		const incoming = bodyEl.lastElementChild as HTMLElement | null;
		const to = incoming?.offsetHeight ?? 0;
		if (!from || !to || from === to) return;
		height = `${from}px`;
		requestAnimationFrame(() => {
			height = `${to}px`;
			// Not via `later` — this cosmetic reset must survive a pause.
			setTimeout(() => (height = ''), 550);
		});
	}

	const sequence: Attachment<HTMLElement> = (node) => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			stage = FINAL;
			resolved = steps.length;
			return;
		}
		// Only start once the whole card is on screen — the morph is the story,
		// and a half-seen start reads as a glitch. Cards taller than the viewport
		// (small screens) can never hit 100%, so they start at 75% instead.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					later(() => morphTo(1), 1400);
				}
			},
			{ threshold: node.offsetHeight < window.innerHeight ? 1 : 0.75 }
		);
		observer.observe(node);
		return () => {
			observer.disconnect();
			timers.forEach(clearTimeout);
		};
	};

	// Jump to a beat and keep playing from there: the paste re-arms the first
	// morph, the checklist re-arms itself through the stage-1 effect, and the
	// note keeps its automatic slide into the todos. Beat 3 just stays.
	function goTo(next: number) {
		clearTimers();
		paused = false;
		resolved = next <= 1 ? 0 : steps.length;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			stage = next;
			return;
		}
		// Landing on the checklist re-arms it: via the stage-1 effect when the
		// stage actually changes, by hand when the pill points at the beat
		// already showing (the effect does not refire for a no-op stage set).
		const sameStage = stage === next;
		morphTo(next);
		if (next === 0) later(() => morphTo(1), 1400);
		if (next === 1 && sameStage) scheduleChecklist(0);
		if (next === 2) later(() => morphTo(3), 3200);
	}

	// The checklist rows from `from` onward, one per second; the last row arms
	// the two closing morphs. All through `later`, so pause clears everything.
	function scheduleChecklist(from: number) {
		playing = true;
		steps.slice(from).forEach((_, offset) => {
			const index = from + offset;
			later(
				() => {
					resolved = index + 1;
					if (index === steps.length - 1) {
						playing = false;
						later(() => morphTo(2), 1400);
						later(() => morphTo(3), 3200);
					}
				},
				1000 * (offset + 1)
			);
		});
	}

	// Freeze mid-beat, or pick up exactly where it froze.
	function togglePlay() {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (paused) {
			paused = false;
			if (stage === 0) later(() => morphTo(1), 1400);
			else if (stage === 1) scheduleChecklist(resolved);
			else if (stage === 2) later(() => morphTo(3), 3200);
		} else {
			paused = true;
			playing = false;
			clearTimers();
		}
	}

	// The checklist plays once the card has morphed to it; the result beats
	// follow when the last row resolves.
	$effect(() => {
		if (stage !== 1) return;
		scheduleChecklist(0);
		return () => {
			playing = false;
		};
	});
</script>

<div {@attach sequence} class="flex w-full max-w-3xl flex-col items-stretch">
	<Surface label={labels[stage]}>
		<!-- chisel-ignore structural:inline-style-banned -- Morph height follows measured animated content. -->
		<div class="morph" bind:this={bodyEl} style:height={height === '' ? null : height}>
			{#if stage === 0}
				<div
					in:fade={{ duration: 300, delay: 120 }}
					out:fade={{ duration: 200 }}
					class="flex flex-col gap-3.5 px-5 py-5"
				>
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
			{:else if stage === 1}
				<ul
					in:fade={{ duration: 300, delay: 120 }}
					out:fade={{ duration: 200 }}
					class="divide-y divide-border"
				>
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
								<Loader
									class="size-4 shrink-0 animate-spin text-muted-foreground"
									aria-hidden="true"
								/>
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
			{:else}
				<div in:fade={{ duration: 300, delay: 120 }} out:fade={{ duration: 200 }}>
					<div class="entered flex flex-col gap-5 px-5 py-5">
						<h3 class="font-serif text-2xl font-medium tracking-tight">Client brief standup</h3>
						<div class="flex flex-col gap-2">
							<p class="eyebrow">Decisions</p>
							<ul class="flex flex-col gap-1.5 text-sm leading-relaxed">
								<li>The brief reaches marketing by <Carried derived>Friday 31 July</Carried>.</li>
								<li>
									Examples stay free of personal data, <Carried>as in the previous round</Carried>.
								</li>
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

					{#if stage >= 3}
						<div transition:slide={{ duration: 400 }} class="entered border-t border-border">
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
												class="mark-chip inline-flex h-5 items-center rounded-4xl bg-brand/10 px-2 text-xs font-medium text-brand underline decoration-brand decoration-dotted decoration-2 underline-offset-4 dark:bg-brand/20"
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
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</Surface>
	<div class="flex items-center justify-center gap-2 pt-3">
		<Button
			variant="ghost"
			type="button"
			class="flex size-4 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground"
			aria-label={paused ? 'Play the demo' : 'Pause the demo'}
			onclick={togglePlay}
		>
			{#if paused}
				<Play class="size-3" />
			{:else}
				<Pause class="size-3" />
			{/if}
		</Button>
		{#each labels as label, index (label)}
			<Button
				variant="ghost"
				type="button"
				class="h-1 rounded-full transition-all duration-(--duration-panel) ease-(--ease-standard) {index ===
				stage
					? 'w-4 bg-brand'
					: 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'}"
				aria-label={label}
				aria-current={index === stage ? 'true' : undefined}
				onclick={() => goTo(index)}
			></Button>
		{/each}
	</div>
</div>
