<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import FigureBoard from '$lib/components/marketing/figure-board.svelte';
	import FigureDiagram from '$lib/components/marketing/figure-diagram.svelte';
	import FigureMemory from '$lib/components/marketing/figure-memory.svelte';
	import FigureTranscript from '$lib/components/marketing/figure-transcript.svelte';
	import Reveal from '$lib/components/marketing/reveal.svelte';

	const steps = [
		{ n: '1', title: 'Write the note', line: 'Meeting notes, research, a rough plan, a paste.' },
		{
			n: '2',
			title: 'It reads the project',
			line: 'Past decisions, standing constraints, deadlines.'
		},
		{ n: '3', title: 'It proposes', line: 'Todos, links, diagrams, memory entries.' },
		{ n: '4', title: 'You accept', line: 'Or you reject, and nothing is written.' }
	];

	const rest = [
		{ title: 'Today', line: 'Overdue, due today, and who you are waiting on.' },
		{ title: 'Two notes at once', line: 'Drag a tab sideways and read them side by side.' },
		{ title: 'Skills', line: 'Actions you keep and run on a selection.' },
		{ title: 'Attachments', line: 'Drop the source files in and they become searchable.' },
		{ title: 'Chat', line: 'Conversations that start already knowing the project.' },
		{ title: 'Export', line: 'PDF and Word, with defaults you set once per project.' }
	];
</script>

<!-- 1 · Hero: centred, short, out of the way -->
<section>
	<div
		class="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 pt-20 pb-4 text-center sm:pt-28"
	>
		<Reveal class="flex flex-col items-center gap-6">
			<h1
				class="font-serif text-4xl leading-[1.08] font-medium tracking-tight text-balance sm:text-6xl"
			>
				It already knows what you're working on.
			</h1>
			<p class="max-w-lg text-lg text-muted-foreground">A notes editor you never have to brief.</p>
			<div class="flex flex-wrap items-center justify-center gap-3">
				<Button href="/auth/login" size="lg">Sign in</Button>
				<Button
					href="https://github.com/ChidiRnweke/FollowThrough.ai"
					variant="ghost"
					size="lg"
					target="_blank"
					rel="noreferrer">Read the code</Button
				>
			</div>
		</Reveal>
	</div>
</section>

<!-- 2 · The demo: tall, vertical, no caption -->
<section>
	<div class="mx-auto flex w-full max-w-3xl flex-col px-6 py-14">
		<Reveal delay={100}>
			<FigureTranscript />
		</Reveal>
	</div>
</section>

<!-- 3 · How it works: a wide numbered row. The biggest shape change on the page. -->
<section class="border-y border-border bg-muted/30">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 sm:py-20">
		<Reveal>
			<h2 class="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
				Every time, the same four beats.
			</h2>
		</Reveal>
		<Reveal class="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
			{#each steps as step (step.n)}
				<div class="flex flex-col gap-2">
					<span class="font-serif text-4xl leading-none font-medium text-brand">{step.n}</span>
					<span class="text-base font-medium">{step.title}</span>
					<span class="text-sm text-muted-foreground">{step.line}</span>
				</div>
			{/each}
		</Reveal>
		<Reveal>
			<p class="font-serif text-2xl font-medium tracking-tight">Nothing lands without you.</p>
		</Reveal>
	</div>
</section>

<!-- 4 · Memory: one wide panel, the single biggest feature moment -->
<section class="border-b border-border bg-muted/30">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 sm:pb-20">
		<Reveal class="flex flex-col gap-3">
			<h2 class="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">
				It knows, because you told it once.
			</h2>
			<p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
				Every project keeps its own decisions, constraints, and preferences. Come back in three
				weeks and they are still there. Try the row the agent is proposing.
			</p>
		</Reveal>
		<Reveal>
			<FigureMemory />
		</Reveal>
	</div>
</section>

<!-- 5 · Everything else: a three-across grid. Board and diagrams are cards, not chapters. -->
<section class="border-b border-border">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:py-20">
		<Reveal class="grid gap-8 lg:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-2xl font-medium tracking-tight">You didn't build this board.</h3>
				<p class="text-sm text-muted-foreground">
					The agent opened every card from a note, and keeps them moving as the notes change.
				</p>
				<div class="pt-2"><FigureBoard /></div>
			</div>
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-2xl font-medium tracking-tight">
					Select a paragraph. Get the diagram.
				</h3>
				<p class="text-sm text-muted-foreground">
					It renders in the note. Open it in draw.io when it needs a human hand.
				</p>
				<div class="pt-2"><FigureDiagram /></div>
			</div>
		</Reveal>

		<Reveal
			class="grid gap-px border-t border-border bg-border pt-px sm:grid-cols-2 lg:grid-cols-3"
		>
			{#each rest as item (item.title)}
				<div class="flex flex-col gap-1 bg-background px-5 py-4">
					<span class="text-sm font-medium">{item.title}</span>
					<span class="text-sm text-muted-foreground">{item.line}</span>
				</div>
			{/each}
		</Reveal>
	</div>
</section>

<!-- 6 · Close: centred, a question, and the one human fact on the page -->
<section>
	<div
		class="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28"
	>
		<Reveal class="flex flex-col items-center gap-6">
			<h2 class="font-serif text-3xl font-medium tracking-tight text-balance sm:text-4xl">
				Tired of explaining your project to a chat box?
			</h2>
			<p class="max-w-md text-base text-muted-foreground">
				Built and run by one person. Access is approved by hand, so signing in tells me you're
				waiting.
			</p>
			<Button href="/auth/login" size="lg">Sign in</Button>
		</Reveal>
	</div>
</section>
