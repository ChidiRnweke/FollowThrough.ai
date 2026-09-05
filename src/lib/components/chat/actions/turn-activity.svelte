<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { getTodo } from '$lib/remote/todos/todos.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { FtChevronRight, FtExternal, FtLoader } from '$lib/components/icons';
	import { turnActivity, turnSteps, type TouchedThing, type TurnRow } from '$lib/components/agent';
	import ToolRow from './tool-row.svelte';
	import TurnFailure from './turn-failure.svelte';
	import { openEntity, rowIcon } from './open-entity';
	import { CHAT_ROW, CHAT_ROW_DETAIL, CHAT_ROW_ICON, CHAT_ROW_INDENT } from './chat-row';

	let {
		tools,
		turnTools,
		shell,
		showLog = false,
		retryable = false,
		onretry
	}: {
		tools: readonly ChatToolActivity[];
		/** Every call of the turn, so a failure put right later in it is not reported here. */
		turnTools?: readonly ChatToolActivity[];
		shell?: ShellContext;
		/**
		 * Whether this group carries the turn's log. Set on the last group only: the log is one
		 * door per turn, not one per group — several "1 step" rows down a turn are doors onto
		 * attempts the agent already put right, and say nothing on their way past.
		 */
		showLog?: boolean;
		/** Whether the run this group belongs to can be run again. */
		retryable?: boolean;
		onretry?: () => void;
	} = $props();

	const activity = $derived(turnActivity(tools, shell, turnTools ?? tools));
	// A group is a run of consecutive calls, so it settles on its own rather than with the
	// turn. Running, its steps arrive one by one in the order they happened; settled, they
	// fold into the things they were about — a list of calls is only interesting as it grows.
	const settled = $derived(!tools.some((tool) => tool.status === 'running'));
	// A thing that failed is stated once, by the failure below, which says what went wrong
	// and what to do about it. A red row above saying the same name is the duplication all
	// over again.
	const rows = $derived(
		(settled ? activity.touched : turnSteps(tools, shell)).filter((row) => row.outcome !== 'failed')
	);

	/** Every call of the turn, which is what the log opens onto. */
	const logged = $derived(turnTools ?? tools);
	const stepCount = $derived(logged.length);
	const hasLog = $derived(showLog && stepCount > 0);

	/**
	 * State, never `$derived` of the run: a turn that is still streaming re-renders on every
	 * delta, and a derived flag would throw away the reader's click each time — the same trap
	 * `chat-reasoning.svelte` documents.
	 */
	let logOpen = $state(false);

	/**
	 * `update_todo` names its subject by id alone, so a resolved title is the difference
	 * between a row a user recognises and one they have to open to identify. Same pattern as
	 * the approval card: fetch, degrade silently, never block the row on it.
	 */
	const todoTitles = new SvelteMap<string, string>();
	$effect(() => {
		// A predicate rather than a cast: the narrowing is real — an action row has no
		// `kind: 'todo'` and no id — and stating it here is what lets the loop below read
		// `row.id` without asserting anything.
		// Failure subjects too: a todo whose change was abandoned is exactly the row a
		// reader needs to recognise, and it never appears in `rows`.
		const named = [...rows, ...activity.failures.flatMap((failure) => failure.subjects)];
		const unnamed = named.filter(
			(row): row is TouchedThing & { id: string } =>
				row.kind === 'todo' && row.id !== undefined && !row.named && !todoTitles.has(row.id)
		);
		let cancelled = false;
		for (const row of unnamed) {
			const id = row.id;
			// audit-allow: silent-catch — activity remains usable and labels the unavailable todo title explicitly.
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

	const titleOf = (row: TurnRow): string =>
		row.kind === 'action'
			? row.label
			: ((row.id ? todoTitles.get(row.id) : undefined) ?? row.title);
</script>

{#snippet rowBody(row: TurnRow)}
	{@const Icon = rowIcon(row)}
	{#if row.outcome === 'running'}
		<FtLoader class="{CHAT_ROW_ICON} animate-spin text-muted-foreground" />
	{:else}
		<Icon class="{CHAT_ROW_ICON} text-muted-foreground" />
	{/if}
	<!-- A phrase, not a table row: pushing the verb to the far edge with `flex-1` made two
	     entries scan as the columns of a table that has no other rows. -->
	<span class="min-w-0 truncate {row.outcome === 'failed' ? 'text-destructive' : ''}">
		{titleOf(row)}
	</span>
	{#if row.kind !== 'action'}
		<!--
			A refusal reports itself here and nowhere else: it is not a failure, so no
			`TurnFailure` sentence explains it, and it is not what the verb says happened —
			the note was not edited, the user declined to let it be. Muted rather than
			destructive, because nothing went wrong; the reader did this on purpose.
		-->
		<span class="shrink-0 text-muted-foreground">
			· {row.outcome === 'rejected' ? 'declined' : row.verb}
		</span>
	{:else if row.outcome === 'rejected'}
		<span class="shrink-0 text-muted-foreground">· declined</span>
	{/if}
{/snippet}

{#if rows.length > 0 || activity.failures.length > 0 || hasLog}
	<!--
		What the turn did, in the user's things rather than in calls. The log is the last row
		of the same list rather than a caption below it, so it carries the same hover wash and
		reads as the same kind of clickable thing. No dividers: two or three rows inside a turn
		are not a page list, and hairlines here would outweigh the transcript they sit in.
	-->
	<div class="flex flex-col gap-2">
		<!-- What went wrong leads: it is the one thing here that might need something from the
		     reader. The record of what did work, and the door to the evidence, follow. -->
		{#each activity.failures as failed, index (`${failed.cause}-${index}`)}
			<TurnFailure failure={failed} titleFor={titleOf} {retryable} {onretry} />
		{/each}

		<ul class="flex flex-col">
			{#each rows as row, index (`${row.kind}-${index}`)}
				<li>
					{#if row.kind !== 'action' && row.id}
						<!-- `CHAT_ROW` neutralises the variant's centring and weight explicitly:
						     they have no counterpart in a bare geometry class and would otherwise
						     survive into a row that has to read as a list item. -->
						<Button
							variant="ghost"
							size="sm"
							class="group/touched {CHAT_ROW}"
							onclick={() => openEntity(row)}
						>
							{@render rowBody(row)}
							<FtExternal
								class="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--duration-micro) group-hover/touched:opacity-100"
							/>
						</Button>
					{:else}
						<!-- Nothing to open, so nothing that looks like it opens. -->
						<div class={CHAT_ROW}>
							{@render rowBody(row)}
						</div>
					{/if}
				</li>
			{/each}
			{#if hasLog}
				<!-- The log joins the list rather than sitting under it as a caption: as bare
				     ghost-button text, nothing said it could be clicked. It says whose calls
				     they are and how many, instead of announcing itself.

				     It opens in place. As a dialog it was a second surface for the one thing in
				     the turn that is pure evidence — the reader lost the conversation to read
				     what was said about it, and came back having to find their place again. A
				     chevron says the same thing the external-link glyph used to, and tells the
				     truth about where the content will appear. -->
				<li>
					<Collapsible.Root bind:open={logOpen}>
						<Collapsible.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="sm"
									class="group/touched {CHAT_ROW} text-muted-foreground [&[data-state=open]>svg:first-child]:rotate-90"
								>
									<FtChevronRight
										class="{CHAT_ROW_ICON} transition-transform duration-(--duration-micro)"
									/>
									<span class="min-w-0 truncate"
										>FollowThrough's agent called {stepCount === 1
											? '1 tool'
											: `${stepCount} tools`}</span
									>
								</Button>
							{/snippet}
						</Collapsible.Trigger>
						<Collapsible.Content class={CHAT_ROW_DETAIL}>
							<!-- Indented under the door it opened from, so the calls read as belonging
							     to it rather than as more rows of the touched list. -->
							<div class="flex flex-col {CHAT_ROW_INDENT}">
								{#each logged as tool, index (tool.callId || index)}
									<ToolRow {tool} {shell} />
								{/each}
							</div>
						</Collapsible.Content>
					</Collapsible.Root>
				</li>
			{/if}
		</ul>
	</div>
{/if}
