<script lang="ts">
	import type { AgentExecutionMode, ConversationImageInput } from '$lib/models/agent';
	import type { ContextChip, SelectionChip } from '$lib/stores/agent/chat.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import {
		FtSend as SendHorizontal,
		FtDocument as FileText,
		FtFolder as Folder,
		FtSkills as Wrench,
		FtPin as Pin,
		FtPinOff as PinOff,
		FtCheck as Check,
		FtWorkflow as Workflow,
		FtAttachments as Paperclip,
		FtClose as X,
		FtStop as Square
	} from '$lib/components/icons';
	import ImageLightbox from '../image-lightbox.svelte';

	let {
		prompt = $bindable(''),
		textareaRef = $bindable<HTMLTextAreaElement | null>(null),
		autoChip,
		liveSelection,
		chips,
		mentionCandidates,
		highlighted,
		selectedImages,
		agentAvailable,
		isStreaming,
		connection,
		executionMode,
		onremovechip,
		onpick,
		onhighlight,
		onremoveimage,
		onfiles,
		onkeydown,
		oninput,
		onpaste,
		ontoggleexecutionmode,
		onsend,
		onstop
	}: {
		prompt?: string;
		textareaRef?: HTMLTextAreaElement | null;
		autoChip?: ContextChip;
		/** The passage highlighted right now: attached, but still following the caret. */
		liveSelection?: SelectionChip;
		chips: readonly ContextChip[];
		mentionCandidates: readonly ContextChip[];
		highlighted: number;
		selectedImages: readonly ConversationImageInput[];
		agentAvailable: boolean;
		isStreaming: boolean;
		connection: 'detached' | 'connected' | 'reconnecting' | 'offline';
		executionMode: AgentExecutionMode;
		onremovechip: (chip: ContextChip, automatic: boolean) => void;
		onpick: (chip: ContextChip) => void;
		onhighlight: (index: number) => void;
		onremoveimage: (id: string) => void;
		onfiles: (files: readonly File[]) => void;
		onkeydown: (event: KeyboardEvent) => void;
		oninput: () => void;
		onpaste: (event: ClipboardEvent) => void;
		ontoggleexecutionmode: () => void;
		onsend: () => void;
		onstop: () => void;
	} = $props();
</script>

{#snippet chipBadge(chip: ContextChip, automatic: boolean)}
	<!-- The live selection is the one chip that is still moving: it follows the caret and is
	     let go the moment the highlight changes. The dashed, unfilled badge and the open pin
	     say that before the user has to find out — a pin, by contrast, stays where it was put. -->
	{@const live = automatic && chip.kind === 'selection'}
	<!-- A pinned passage spends part of its width on the word count, so the title would be
	     truncated past use inside a resource chip's budget. The extra room buys back the note
	     name, which is the half that says where the passage came from. -->
	<Badge
		variant={live ? 'outline' : 'secondary'}
		class="{chip.kind === 'selection' ? 'max-w-60' : 'max-w-44'} gap-1 pr-1 {live
			? 'border-dashed text-muted-foreground'
			: ''}"
	>
		{#if chip.kind === 'skill'}
			<Wrench class="size-3 shrink-0" />
		{:else if chip.kind === 'folder'}
			<Folder class="size-3 shrink-0" />
		{:else if chip.kind === 'selection'}
			{#if live}
				<PinOff class="size-3 shrink-0" />
			{:else}
				<Pin class="size-3 shrink-0" />
			{/if}
		{:else}
			<FileText class="size-3 shrink-0" />
		{/if}
		<!-- Naming the note would be a worse label here: the highlight is not the note, and it
		     is about to be some other part of it. The title is on the hover card instead. -->
		<span class="truncate">{live ? 'Current selection' : chip.name}</span>
		{#if chip.kind === 'folder'}
			<span class="shrink-0 text-xs text-muted-foreground">
				{chip.noteCount === 1 ? '1 note' : `${chip.noteCount ?? 0} notes`}
			</span>
		{:else if chip.kind === 'selection'}
			<!-- The count goes where the folder's does, because it answers the same question:
			     the chip names a source, and this says how much of it came along. -->
			<span class="shrink-0 text-xs text-muted-foreground">
				{chip.wordCount === 1 ? '1 word' : `${chip.wordCount} words`}
			</span>
		{/if}
		<!-- A note chip and a passage chip from the same note read identically by name, so the
		     passage says what it is: "Remove Q3 planning" and "Remove the passage pinned from Q3
		     planning" are different things to undo. -->
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={live
				? 'Remove the current selection from context'
				: chip.kind === 'selection'
					? `Remove the passage pinned from ${chip.name} from context`
					: `Remove ${chip.name} from context`}
			onclick={() => onremovechip(chip, automatic)}
		>
			<X />
		</Button>
	</Badge>
{/snippet}

<!--
	A pinned passage is the one chip whose name does not identify it: two excerpts of the same
	note carry the same title, and the title says nothing about which paragraph travelled. The
	card is where that is settled — the excerpt itself, clamped, so a long pin stays a chip.
-->
{#snippet selectionChipBadge(chip: SelectionChip, automatic: boolean)}
	<HoverCard.Root openDelay={120}>
		<HoverCard.Trigger>
			{#snippet child({ props })}
				<span {...props}>{@render chipBadge(chip, automatic)}</span>
			{/snippet}
		</HoverCard.Trigger>
		<HoverCard.Content class="w-72 gap-1" side="top" align="start">
			<p class="eyebrow">{automatic ? 'Selected in' : 'Pinned from'} {chip.name}</p>
			<p class="line-clamp-6 text-sm whitespace-pre-wrap text-muted-foreground">
				{chip.selection.text}
			</p>
		</HoverCard.Content>
	</HoverCard.Root>
{/snippet}

<!--
	The composer is one group: chips, attachments, field, and toolbar all describe the
	message about to be sent. Its internal ladder follows DESIGN_SYSTEM's spacing rule —
	8px between the parts that stand on their own (chips, thumbnails, the field) and 4px
	binding the toolbar to the field it acts on.
-->
<div class="flex flex-col gap-2">
	{#if autoChip || liveSelection || chips.length > 0}
		<div class="flex flex-wrap items-center gap-1" aria-label="Chat context">
			{#if autoChip}
				{@render chipBadge(autoChip, true)}
			{/if}
			<!-- Between the note it was highlighted in and the passages already pinned: it is
			     narrower than the note and less settled than the pins. -->
			{#if liveSelection}
				{@render selectionChipBadge(liveSelection, true)}
			{/if}
			{#each chips as chip (chip.kind + chip.id)}
				{#if chip.kind === 'selection'}
					{@render selectionChipBadge(chip, false)}
				{:else}
					{@render chipBadge(chip, false)}
				{/if}
			{/each}
		</div>
	{/if}

	<div class="relative flex flex-col gap-1">
		{#if mentionCandidates.length > 0}
			<div
				class="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-md"
				role="listbox"
				aria-label="Mention a note, folder, or skill"
			>
				{#each mentionCandidates as candidate, index (candidate.kind + candidate.id)}
					<Button
						variant="ghost"
						type="button"
						role="option"
						aria-selected={index === highlighted}
						class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm {index ===
						highlighted
							? 'bg-accent text-accent-foreground'
							: ''}"
						onpointerenter={() => onhighlight(index)}
						onclick={() => onpick(candidate)}
					>
						{#if candidate.kind === 'skill'}
							<Wrench class="size-3.5 shrink-0 text-muted-foreground" />
						{:else if candidate.kind === 'folder'}
							<Folder class="size-3.5 shrink-0 text-muted-foreground" />
						{:else}
							<FileText class="size-3.5 shrink-0 text-muted-foreground" />
						{/if}
						<span class="truncate">{candidate.name}</span>
						<span class="ml-auto text-xs text-muted-foreground">
							{candidate.kind === 'skill'
								? 'Skill'
								: candidate.kind === 'folder'
									? 'Folder'
									: 'Note'}
						</span>
					</Button>
				{/each}
			</div>
		{/if}
		{#if selectedImages.length}
			<div class="flex flex-wrap gap-2" aria-label="Attached images">
				{#each selectedImages as image (image.id)}
					<div class="relative">
						<ImageLightbox
							src={image.dataUrl}
							alt={image.name}
							class="size-16 rounded-md object-cover"
						/>
						<Button
							variant="secondary"
							size="icon-xs"
							class="absolute -right-1 -top-1"
							aria-label={`Remove ${image.name}`}
							onclick={() => onremoveimage(image.id)}
						>
							<X />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
		<!-- The base textarea is `field-sizing-content` with no ceiling, so a long draft
	     grows until it owns the panel. The cap turns it into an internal scroll; the
	     `@layer base` scrollbar rules already style it to match the ScrollArea panes. -->
		<Textarea
			id="chat-composer"
			bind:value={prompt}
			bind:ref={textareaRef}
			placeholder="Ask the agent… (@ to add context)"
			rows={2}
			class="max-h-56 min-h-16 resize-none overflow-y-auto"
			{onkeydown}
			{oninput}
			{onpaste}
			disabled={!agentAvailable}
		/>
		<div class="flex items-center gap-2">
			<Label
				class="tactile inline-flex size-8 items-center justify-center rounded-md"
				aria-label="Attach images"
			>
				<Paperclip class="size-4" />
				<Input
					type="file"
					accept="image/png,image/jpeg,image/webp"
					multiple
					class="sr-only"
					onchange={(event) => {
						const input = event.currentTarget;
						onfiles([...(input.files ?? [])]);
						input.value = '';
					}}
				/>
			</Label>
			<Tip
				text={executionMode === 'auto_accept'
					? 'The agent applies changes without asking. Click to require approval.'
					: 'The agent asks before it changes anything. Click to auto-accept.'}
			>
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="xs"
						aria-pressed={executionMode === 'auto_accept'}
						class={executionMode === 'auto_accept'
							? 'bg-brand/10 text-brand dark:bg-brand/15'
							: 'text-muted-foreground'}
						onclick={ontoggleexecutionmode}
					>
						{#if executionMode === 'auto_accept'}
							<Workflow data-icon="inline-start" /> Auto-accept
						{:else}
							<Check data-icon="inline-start" /> Approval
						{/if}
					</Button>
				{/snippet}
			</Tip>
			<Badge
				variant="secondary"
				class={isStreaming && connection !== 'connected' ? undefined : 'hidden'}
				aria-live="polite"
			>
				{connection === 'offline' ? 'Offline · run continues' : 'Reconnecting'}
			</Badge>
			<Button
				size="icon-sm"
				class="ml-auto"
				aria-label={isStreaming ? 'Stop generation' : 'Send message'}
				onclick={isStreaming ? onstop : onsend}
				disabled={!agentAvailable ||
					(!isStreaming && prompt.trim() === '' && !selectedImages.length)}
			>
				{#if isStreaming}
					<Square />
				{:else}
					<SendHorizontal class="size-4" />
				{/if}
			</Button>
		</div>
	</div>
</div>
