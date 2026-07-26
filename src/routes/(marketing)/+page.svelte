<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Crayon from '$lib/components/marketing/crayon.svelte';
	import FigureTranscript from '$lib/components/marketing/figure-transcript.svelte';
	import Reveal from '$lib/components/marketing/reveal.svelte';
	import Shot from '$lib/components/marketing/shot.svelte';
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
				FollowThrough's agent already <Crayon>knows</Crayon> what you're working on.
			</h1>
			<p class="max-w-lg text-lg text-muted-foreground">
				An AI-native note editor that you never have to brief.
			</p>
			<div class="flex flex-wrap items-center justify-center gap-3">
				<Button href="/auth/login" size="lg">Sign in</Button>
			</div>
		</Reveal>
	</div>
</section>

<!-- 2 · The value, enacted: a paste becomes a clean note and two todos -->
<section>
	<div class="mx-auto flex w-full max-w-3xl flex-col px-6 py-14">
		<Reveal delay={100}>
			<FigureTranscript />
		</Reveal>
	</div>
</section>

<!-- 3 · The same loop, in the real product: the editor with the agent at work beside it -->
<section class="border-y border-border bg-muted/30">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:py-20">
		<Reveal class="flex flex-col gap-3">
			<h2 class="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">
				Your agent lives inside your notes and <Crayon>understands</Crayon> your work.
			</h2>
		</Reveal>
		<Reveal delay={100}>
			<Shot
				id="in-editor-chat"
				label="Editor · agent"
				alt="A note open in the editor while the agent panel creates a new note from it, every tool call listed"
			/>
		</Reveal>
	</div>
</section>

<!-- 4 · Memory: the context the agent works from, visible per project -->
<section class="border-b border-border">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-16 pb-16 sm:pt-20 sm:pb-20">
		<Reveal class="flex flex-col gap-3">
			<h2 class="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">
				Your agent <Crayon>remembers</Crayon>.
			</h2>
			<p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
				Every project keeps its own decisions, constraints, and preferences. Come back in three
				weeks and they are still there.
			</p>
		</Reveal>
		<Reveal>
			<Shot
				id="project-context"
				label="Project · memory"
				alt="A project page split into what was produced here and what the agent works from: memory, attachments"
			/>
		</Reveal>
	</div>
</section>

<!-- 5 · The selection toolbar and the diagrams it produces -->
<section class="border-b border-border bg-muted/30">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:py-20">
		<Reveal class="grid gap-8 lg:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-2xl font-medium tracking-tight">
					Select a paragraph. Get the <Crayon>diagram</Crayon>.
				</h3>
				<p class="text-sm text-muted-foreground">
					Highlight any passage — ask about it, extract its promises, find related notes, or turn it
					into a diagram.
				</p>
				<div class="pt-2">
					<Shot
						id="in-editor-ai"
						label="Editor · selection"
						alt="A selected passage in a note with the AI toolbar above it: ask, extract promises, find related, diagram"
					/>
				</div>
			</div>
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-2xl font-medium tracking-tight">
					<Crayon>First-class</Crayon> support for diagrams.
				</h3>
				<p class="text-sm text-muted-foreground">
					Mermaid source on one side, the live render on the other — Revise with AI keeps it in sync
					with the note.
				</p>
				<div class="pt-2">
					<Shot
						id="diagram-render"
						label="Mermaid · live render"
						alt="The diagram editor: Mermaid source beside its live render, with Revise with AI"
					/>
				</div>
			</div>
		</Reveal>
	</div>
</section>

<!-- 6 · The board the agent builds and keeps moving -->
<section class="border-b border-border">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:py-20">
		<Reveal class="flex flex-col gap-3">
			<h2 class="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">
				<Crayon>You</Crayon> didn't build this board. Your agent did.
			</h2>
			<p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
				The agent opened every card from a note, and keeps them moving as the notes change.
			</p>
		</Reveal>
		<Reveal>
			<Shot
				id="todo-board"
				label="Board · todos"
				alt="A kanban board of commitments while the agent updates cards and summarises what it changed"
			/>
		</Reveal>
	</div>
</section>

<!-- 7 · Tools: everything you can do, it can do — under your toggles -->
<section class="border-b border-border bg-muted/30">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:py-20">
		<Reveal class="flex flex-col gap-3">
			<h2 class="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">
				Your agent <Crayon>lives</Crayon> inside FollowThrough and can do anything you can.
			</h2>
			<p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
				Create notes, todos, and projects; publish; export. Every capability is a tool you can turn
				off — and a tool you turn off disappears from chat, tool search, and MCP clients.
			</p>
		</Reveal>
		<Reveal>
			<Shot
				id="tools"
				label="Settings · tools"
				alt="The agent's tool list: every capability with a toggle, filtered by changes, proposals, and reading"
			/>
		</Reveal>
	</div>
</section>

<!-- 8 · Skills and models: your way of working, your choice of brain -->
<section class="border-b border-border">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 sm:py-20">
		<Reveal class="grid gap-8 lg:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-2xl font-medium tracking-tight">
					Teach your agent your workflow <Crayon>once</Crayon>. It runs it on cue.
				</h3>
				<p class="text-sm text-muted-foreground">
					A skill is a trigger description plus your instructions. The agent loads it the moment
					it's relevant — and follows it every time after.
				</p>
				<div class="pt-2">
					<Shot
						id="skill-support"
						label="Skill · definition"
						alt="A skill page: when the agent should load it, and the instructions it follows when it does"
					/>
				</div>
			</div>
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-2xl font-medium tracking-tight">
					Your editor, your model, your <Crayon>choice</Crayon>.
				</h3>
				<p class="text-sm text-muted-foreground">
					Pick any model from any provider, and decide per pipeline whether durable changes wait for
					your approval.
				</p>
				<div class="pt-2">
					<Shot
						id="open-model-access"
						label="Settings · agent"
						alt="Agent settings: a model picker across providers, approval-required versus auto-accept execution"
					/>
				</div>
			</div>
		</Reveal>
	</div>
</section>

<!-- 9 · Close: centred, a question, and the one human fact on the page -->
<section>
	<div
		class="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28"
	>
		<Reveal class="flex flex-col items-center gap-6">
			<h2 class="font-serif text-3xl font-medium tracking-tight text-balance sm:text-4xl">
				Ready to work fully agentic?
			</h2>
			<p class="max-w-md text-base text-muted-foreground">
				FollowThrough is in closed beta. Want in?
				<Button
					href="https://github.com/ChidiRnweke/FollowThrough.ai/issues"
					variant="link"
					target="_blank"
					rel="noreferrer"
					class="h-auto px-0.5 text-base font-medium text-foreground underline decoration-brand decoration-2 underline-offset-4 hover:decoration-4"
					>Raise an issue on GitHub</Button
				> and I'll know you're waiting.
			</p>
			<Button href="/auth/login" size="lg">Sign in</Button>
		</Reveal>
	</div>
</section>
