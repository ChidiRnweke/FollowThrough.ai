<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { getTodo } from '$lib/remote/todos/todos.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { FtChevronRight, FtLoader, FtReading } from '$lib/components/icons';
	import {
		readDoorLabel,
		runningSteps,
		turnContext,
		type SubjectActivity
	} from '$lib/components/agent';
	import SubjectRow from './subject-row.svelte';
	import SubjectPasses from './subject-passes.svelte';
	import TurnFailure from './turn-failure.svelte';
	import {
		CHAT_GAP_SUBJECT,
		CHAT_ROW,
		CHAT_TEXT_REQUEST,
		CHAT_ROW_DETAIL,
		CHAT_ROW_ICON,
		CHAT_ROW_INDENT,
		chatActionEmphasis
	} from './chat-row';

	let {
		tools,
		turnTools,
		shell,
		summarise = false,
		retryable = false,
		onretry
	}: {
		tools: readonly ChatToolActivity[];
		/** Every call of the turn, which is what the summary is folded over. */
		turnTools?: readonly ChatToolActivity[];
		shell?: ShellContext;
		/**
		 * Whether this group carries the turn's summary. Set on the last group only: the fold is
		 * over the whole turn, and one per group would state the same note once per group it was
		 * touched in — the duplication this surface exists to avoid, one level up.
		 */
		summarise?: boolean;
		/** Whether the run this group belongs to can be run again. */
		retryable?: boolean;
		onretry?: () => void;
	} = $props();

	const everything = $derived(turnTools ?? tools);
	// A group settles on its own rather than with the turn. Running, its steps arrive one by one
	// in the order they happened, because the point is watching it work; settled, the whole turn
	// folds into the subjects it was about, because the point is auditing what it saw.
	const running = $derived(tools.some((tool) => tool.status === 'running'));
	const context = $derived(turnContext(everything, shell));
	const steps = $derived(running ? runningSteps(tools) : []);

	/** Everything the reader can see at a glance, so the door knows whether it has a job. */
	const behindTheDoor = $derived(
		context.read.length + context.barren.length + context.setup.length
	);

	/**
	 * State, never `$derived` of the run: a turn that is still streaming re-renders on every
	 * delta, and a derived flag would throw away the reader's click each time — the same trap
	 * `chat-reasoning.svelte` documents.
	 */
	let doorOpen = $state(false);

	/**
	 * `update_todo` names its subject by id alone, so a resolved title is the difference between
	 * a row a reader recognises and one they have to open to identify. Fetch, degrade visibly,
	 * never block the row on it.
	 */
	const todoTitles = new SvelteMap<string, string>();
	$effect(() => {
		const rows = [
			...context.changed,
			...context.read,
			...context.failures.flatMap((failure) => failure.subjects)
		];
		const unnamed = rows
			.map((row) => ('entity' in row ? row.entity : row))
			.filter((entity) => entity.kind === 'todo' && entity.id && !entity.named)
			.map((entity) => entity.id as string)
			.filter((id) => !todoTitles.has(id));
		let cancelled = false;
		for (const id of unnamed) {
			// audit-allow: silent-catch — the row states the unavailable title in place of the name.
			void getTodo(id)
				.then((todo) => {
					if (!cancelled) todoTitles.set(id, todo.title);
				})
				.catch(() => {
					if (!cancelled) todoTitles.set(id, 'Todo title unavailable');
					console.warn('Todo title unavailable', id);
				});
		}
		return () => {
			cancelled = true;
		};
	});

	const titleOf = (subject: SubjectActivity): string =>
		(subject.entity.id ? todoTitles.get(subject.entity.id) : undefined) ?? subject.entity.title;
</script>

<!--
	What the turn did, in the reader's own notes and todos rather than in the agent's calls.

	The unit is the subject, not the call. One instruction ("tighten this note") ran six calls over
	one note — a read, a search, two excerpts, an edit — and as a list of calls that is six rows
	saying one fact, with the note's name on three of them. Folded, it is one row that opens onto
	all six.

	Two levels, because there are two questions. What changed is the reader's own work and leads.
	What was only read is the context the answer stands on, and lives behind one door — nobody
	needs it to trust an answer that looks right, and everybody needs it the moment one does not.
-->
{#if running}
	{#if steps.length > 0}
		<ul class="flex flex-col">
			{#each steps as step, index (index)}
				<li class="{CHAT_ROW} text-muted-foreground">
					{#if step.outcome === 'running'}
						<FtLoader class="{CHAT_ROW_ICON} animate-spin" />
					{:else}
						<span class={CHAT_ROW_ICON} aria-hidden="true"></span>
					{/if}
					<!-- The emphasis sits on the label, not the row: `CHAT_ROW` carries `font-normal`,
					     and this is a plain class attribute rather than `cn()`, so a `font-medium`
					     beside it would be settled by stylesheet order instead of by intent. -->
					<span class="min-w-0 truncate {chatActionEmphasis(step.mutating)}">
						{step.label}{#if step.query}&nbsp;<span class="italic">{step.query}</span
							>{/if}{step.outcome === 'running' ? '…' : ''}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
{:else if summarise && (context.changed.length > 0 || behindTheDoor > 0 || context.failures.length > 0)}
	<div class="flex flex-col {CHAT_GAP_SUBJECT}">
		<!-- What went wrong leads: it is the one entry here that might need something from the
		     reader. The record of what did work, and the door to the evidence, follow. -->
		{#each context.failures as failed, index (`${failed.cause}-${index}`)}
			<TurnFailure failure={failed} {retryable} {onretry} />
		{/each}

		{#each context.changed as subject (`${subject.entity.kind}-${subject.entity.id ?? subject.entity.title}`)}
			<SubjectRow {subject} title={titleOf(subject)} />
		{/each}

		{#if behindTheDoor > 0}
			<!--
				One door, and it says what it holds rather than how hard the agent worked. "Called 6
				tools" named mechanism: it told the reader the number of times something happened and
				nothing about what. A count of notes is a count of things they own.
			-->
			<Collapsible.Root bind:open={doorOpen}>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="sm"
							class="{CHAT_ROW} text-muted-foreground [&[data-state=open]>svg:first-child]:rotate-90"
						>
							<FtChevronRight
								class="{CHAT_ROW_ICON} transition-transform duration-(--duration-micro)"
							/>
							<span class="min-w-0 truncate">{readDoorLabel(context)}</span>
						</Button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content class={CHAT_ROW_DETAIL}>
					<div class="flex flex-col {CHAT_GAP_SUBJECT} {CHAT_ROW_INDENT} pt-1">
						{#each context.read as subject (`${subject.entity.kind}-${subject.entity.id ?? subject.entity.title}`)}
							<SubjectRow {subject} title={titleOf(subject)} />
						{/each}

						{#if context.barren.length > 0}
							<!-- A look that came back with nothing is the one result worth stating in
							     words: there is no passage to show, and its absence is often the whole
							     explanation for a thin answer. -->
							<div class="px-2">
								<SubjectPasses passes={context.barren} />
								<p class="{CHAT_TEXT_REQUEST} pt-1 text-muted-foreground">Nothing came back.</p>
							</div>
						{/if}

						{#if context.setup.length > 0}
							<!-- The agent finding its footing. Named, so nothing is hidden; last and
							     quiet, because none of it is the reader's work. -->
							<p class="{CHAT_TEXT_REQUEST} flex items-start gap-2 px-2 text-muted-foreground">
								<FtReading class="{CHAT_ROW_ICON} mt-0.5" />
								<span class="min-w-0">{context.setup.join(' · ')}</span>
							</p>
						{/if}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
{/if}
