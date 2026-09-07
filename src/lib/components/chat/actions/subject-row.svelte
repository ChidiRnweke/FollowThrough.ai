<script lang="ts">
	import { isWriteVerb, type SubjectActivity } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { FtChevronRight, FtExternal, FtLoader } from '$lib/components/icons';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import { canOpenEntity, entityActionLabel, entityIcon, openEntity } from './open-entity';
	import {
		CHAT_GAP_BOND,
		CHAT_GAP_PASS,
		CHAT_ROW_ICON,
		CHAT_ROW_INDENT,
		CHAT_ROW_STATEMENT,
		CHAT_ROW_DETAIL,
		chatActionEmphasis
	} from './chat-row';
	import SubjectPasses from './subject-passes.svelte';
	import FileOutput from './disclosure/file-output.svelte';

	let {
		subject,
		title
	}: {
		subject: SubjectActivity;
		/** The display name, so a title resolved after the fact reaches the row. */
		title: string;
	} = $props();

	const Icon = $derived(entityIcon[subject.entity.kind]);
	const openable = $derived(canOpenEntity(subject.entity));

	/**
	 * A pass whose evidence is nothing but its own label has nothing behind it. A row of those
	 * alone stays flat: a chevron that pays out a restatement of the row it hangs off is what
	 * teaches a reader to stop opening the next one, including the one that would have shown a
	 * real change.
	 */
	const opens = $derived(subject.passes.some((pass) => pass.evidence.kind !== 'none'));

	const passages = $derived(
		subject.passes.flatMap((pass) =>
			pass.evidence.kind === 'passages' ? [{ label: pass.label, lines: pass.evidence.lines }] : []
		)
	);

	/**
	 * State rather than `$derived` of the run: a turn that is still streaming re-renders on every
	 * delta, and a derived flag would throw away the reader's click each time — the same trap
	 * `chat-reasoning.svelte` documents.
	 */
	let expanded = $state(false);
</script>

{#snippet statement()}
	{#if subject.outcome === 'running'}
		<FtLoader class="{CHAT_ROW_ICON} animate-spin text-muted-foreground" />
	{:else}
		<Icon class="{CHAT_ROW_ICON} text-muted-foreground" />
	{/if}
	<!-- A phrase, not a table row: pushing the verb to the far edge with `flex-1` made two
	     entries scan as the columns of a table that has no other rows. -->
	<span class="min-w-0 truncate font-medium" {title}>{title}</span>
	<span
		class="shrink-0 {subject.outcome === 'failed'
			? 'text-destructive'
			: subject.outcome === 'rejected'
				? 'text-muted-foreground'
				: chatActionEmphasis(isWriteVerb(subject.verb))}"
	>
		<!--
			A refusal reports itself here and nowhere else: it is not a failure, so no
			`TurnFailure` sentence explains it, and it is not what the verb says happened — the
			note was not edited, the reader declined to let it be. Muted rather than destructive,
			because nothing went wrong; they did this on purpose. Muted rather than emphasised for
			the same reason: nothing was written, so nothing here is news.
		-->
		· {subject.outcome === 'rejected' ? 'declined' : subject.verb}
	</span>
{/snippet}

{#snippet openAction()}
	{#if openable}
		<Button
			variant="ghost"
			size="icon-xs"
			class="shrink-0"
			aria-label={entityActionLabel(subject.entity)}
			onclick={() => openEntity(subject.entity)}
		>
			<FtExternal />
		</Button>
	{/if}
{/snippet}

<!--
	One subject the turn touched, and everything it did to it.

	The row is the unit because the subject is: six calls over one note are one fact about one
	note, and a list keyed by call could only ever state it six times. The arrow sits beside the
	name it opens — never on a search row, where it would stand for however many results came
	back and open none of them in particular.
-->
{#if opens}
	<Collapsible.Root>
		<!-- The disclosure and the subject it names are two different actions, so the subject is not
		     inside the trigger: clicking a title to open it must not also toggle a panel. -->
		<div class="flex min-w-0 items-center gap-1">
			<!--
				`min-w-0 flex-1 shrink` belongs on the Button, not on the Trigger, and both halves
				of that are load-bearing.

				The Trigger hands its own `class` to the snippet inside `props`, and the Button
				writes `class=` after `{...props}`, so Svelte's later attribute replaces it —
				anything set on the Trigger never reaches the element. And `buttonVariants` base
				carries `shrink-0`, which `CHAT_ROW_STATEMENT` has no `flex-*`/`shrink-*` to cancel,
				so tailwind-merge keeps it. A `w-full` trigger that also refuses to shrink pushed
				the open-in-a-tab button 28px past the panel's edge, where `overflow-hidden` ate it.
				`shrink` is what cancels the base; `flex-1` alone would not.
			-->
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="{CHAT_ROW_STATEMENT} min-w-0 flex-1 shrink [&[data-state=open]>svg:first-child]:rotate-90"
					>
						<FtChevronRight
							class="{CHAT_ROW_ICON} shrink-0 text-muted-foreground transition-transform duration-(--duration-micro)"
						/>
						{@render statement()}
					</Button>
				{/snippet}
			</Collapsible.Trigger>
			{@render openAction()}
		</div>
		<Collapsible.Content class={CHAT_ROW_DETAIL}>
			<!-- pt-1 is the bond step: this detail belongs to the row directly above it. -->
			<div class="{CHAT_ROW_INDENT} pt-1">
				<ErrorBoundary label="what the agent did here" class="my-0">
					<SubjectPasses passes={subject.passes} onexpand={() => (expanded = true)} />
				</ErrorBoundary>
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
{:else}
	<!-- Nothing behind it, so no chevron. The row keeps the chevron's width as blank space so a
	     mixed column still reads as one column rather than as two ragged ones. -->
	<div class="flex min-w-0 items-center gap-1">
		<div class="{CHAT_ROW_STATEMENT} min-w-0 flex-1">
			<span class={CHAT_ROW_ICON} aria-hidden="true"></span>
			{@render statement()}
		</div>
		{@render openAction()}
	</div>
{/if}

{#if passages.length > 0}
	<!--
		The panel is 384px wide and a passage is file content, so more than a few lines of it
		here is a column of six-word fragments. The dialog is where the reader goes to actually
		read what the agent read — the same escalation the approval card offers with "Review in
		full", and for the same reason. It is an escalation, never the only way in: the first
		lines are always on the row.
	-->
	<Dialog.Root bind:open={expanded}>
		<Dialog.Content class="dialog-fill flex flex-col sm:max-w-4xl">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>What the agent read here, in full.</Dialog.Description>
			</Dialog.Header>
			<div class="flex min-h-0 flex-1 flex-col {CHAT_GAP_PASS} overflow-y-auto">
				{#each passages as passage, index (index)}
					<div class="flex flex-col {CHAT_GAP_BOND}">
						<!-- The hierarchy holds here too, at the dialog's own scale: the request titles the
						     passage under it, so it never renders smaller than what it titles. At full
						     width the passage is body size, so the label matches it and takes the weight
						     and the accent instead — it is still an agent action. -->
						<p class="text-sm font-medium text-brand">{passage.label}</p>
						<FileOutput lines={passage.lines} place="dialog" />
					</div>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
