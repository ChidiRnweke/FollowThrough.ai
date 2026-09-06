<script lang="ts">
	import { isWriteVerb, type ThingActivity } from '$lib/components/agent';
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
	import ThingPasses from './thing-passes.svelte';
	import FileOutput from './disclosure/file-output.svelte';

	let {
		thing,
		title
	}: {
		thing: ThingActivity;
		/** The display name, so a title resolved after the fact reaches the row. */
		title: string;
	} = $props();

	const Icon = $derived(entityIcon[thing.entity.kind]);
	const openable = $derived(canOpenEntity(thing.entity));

	/**
	 * A pass whose evidence is nothing but its own label has nothing behind it. A row of those
	 * alone stays flat: a chevron that pays out a restatement of the row it hangs off is what
	 * teaches a reader to stop opening the next one, including the one that would have shown a
	 * real change.
	 */
	const opens = $derived(thing.passes.some((pass) => pass.evidence.kind !== 'none'));

	const passages = $derived(
		thing.passes.flatMap((pass) =>
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
	{#if thing.outcome === 'running'}
		<FtLoader class="{CHAT_ROW_ICON} animate-spin text-muted-foreground" />
	{:else}
		<Icon class="{CHAT_ROW_ICON} text-muted-foreground" />
	{/if}
	<!-- A phrase, not a table row: pushing the verb to the far edge with `flex-1` made two
	     entries scan as the columns of a table that has no other rows. -->
	<span class="min-w-0 truncate font-medium" {title}>{title}</span>
	<span
		class="shrink-0 {thing.outcome === 'failed'
			? 'text-destructive'
			: thing.outcome === 'rejected'
				? 'text-muted-foreground'
				: chatActionEmphasis(isWriteVerb(thing.verb))}"
	>
		<!--
			A refusal reports itself here and nowhere else: it is not a failure, so no
			`TurnFailure` sentence explains it, and it is not what the verb says happened — the
			note was not edited, the reader declined to let it be. Muted rather than destructive,
			because nothing went wrong; they did this on purpose. Muted rather than emphasised for
			the same reason: nothing was written, so nothing here is news.
		-->
		· {thing.outcome === 'rejected' ? 'declined' : thing.verb}
	</span>
{/snippet}

{#snippet openAction()}
	{#if openable}
		<Button
			variant="ghost"
			size="icon-xs"
			class="shrink-0"
			aria-label={entityActionLabel(thing.entity)}
			onclick={() => openEntity(thing.entity)}
		>
			<FtExternal />
		</Button>
	{/if}
{/snippet}

<!--
	One thing the turn touched, and everything it did to it.

	The row is the unit because the thing is: six calls over one note are one fact about one
	note, and a list keyed by call could only ever state it six times. The arrow sits beside the
	name it opens — never on a search row, where it would stand for however many results came
	back and open none of them in particular.
-->
{#if opens}
	<Collapsible.Root>
		<!-- The disclosure and the thing it names are two different actions, so the thing is not
		     inside the trigger: clicking a title to open it must not also toggle a panel. -->
		<div class="flex min-w-0 items-center gap-1">
			<Collapsible.Trigger class="min-w-0 flex-1">
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="{CHAT_ROW_STATEMENT} min-w-0 [&[data-state=open]>svg:first-child]:rotate-90"
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
					<ThingPasses passes={thing.passes} onexpand={() => (expanded = true)} />
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
						<p class="provenance-caption">{passage.label}</p>
						<FileOutput lines={passage.lines} bounded={false} />
					</div>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
