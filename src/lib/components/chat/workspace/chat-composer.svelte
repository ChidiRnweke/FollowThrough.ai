<script lang="ts">
	import type { AgentExecutionMode, AgentModel, ConversationImageInput } from '$lib/models/agent';
	import type { ContextChip, SelectionChip } from '$lib/stores/agent/chat.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { ModelInlinePicker } from '$lib/components/agent';
	import {
		FtSend as SendHorizontal,
		FtDocument as FileText,
		FtFolder as Folder,
		FtSkills as Wrench,
		FtPin as Pin,
		FtCheck as Check,
		FtWorkflow as Workflow,
		FtAttachments as Paperclip,
		FtClose as X,
		FtLoader as Loader,
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
		models,
		modelOverride,
		defaultModelId,
		visionModelOverride,
		defaultVisionModelId,
		onremovechip,
		onpinselection,
		onpick,
		onhighlight,
		onremoveimage,
		onfiles,
		onkeydown,
		oninput,
		onpaste,
		ontoggleexecutionmode,
		onmodelchange,
		onvisionmodelchange,
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
		models: readonly AgentModel[];
		/** This conversation's own model, or null when it inherits the workspace default. */
		modelOverride: string | null;
		/** The workspace default, resolved on the server so it names a real model. */
		defaultModelId: string;
		visionModelOverride: string | null;
		defaultVisionModelId: string;
		onremovechip: (chip: ContextChip, automatic: boolean) => void;
		/** Promotes the highlighted passage to a pin, which stops it following the caret. */
		onpinselection: (chip: SelectionChip) => void;
		onpick: (chip: ContextChip) => void;
		onhighlight: (index: number) => void;
		onremoveimage: (id: string) => void;
		onfiles: (files: readonly File[]) => void;
		onkeydown: (event: KeyboardEvent) => void;
		oninput: () => void;
		onpaste: (event: ClipboardEvent) => void;
		ontoggleexecutionmode: () => void;
		onmodelchange: (value: string | null) => void;
		onvisionmodelchange: (value: string | null) => void;
		onsend: () => void;
		onstop: () => void;
	} = $props();
</script>

{#snippet chipBadge(chip: ContextChip, automatic: boolean)}
	<!-- The live selection is the one chip that is still moving: it stands for whatever is
	     highlighted, and is let go once the caret lands somewhere else. The dashed, unfilled
	     badge says that; a pin, by contrast, stays where it was put. -->
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
				<!-- The gesture the pin glyph invites, made real. Reaching for it and getting
				     nothing was the whole complaint: it looked like the control that keeps the
				     passage, so it is. -->
				<Tip text="Keep this passage in the message">
					{#snippet children({ props })}
						<Button
							{...props}
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Pin this passage to the message"
							onclick={() => onpinselection(chip)}
						>
							<Pin />
						</Button>
					{/snippet}
				</Tip>
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
		<!--
			Outside the group on purpose. `InputGroupAddon` focuses the first `<input>` it
			finds inside the group when its blank space is clicked, and a hidden file input
			in the toolbar is exactly that element — clicking beside the paperclip would
			focus the file picker instead of the draft.
		-->
		<Input
			id="chat-composer-attach"
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
		<!--
			Field and toolbar are one control, not a box with a row under it: what the next
			turn will do — which model, whether it asks first, what it carries — is part of
			the message being written, and the group's single focus wash says so.
		-->
		<InputGroup.Root>
			{#if selectedImages.length}
				<InputGroup.Addon align="block-start" class="flex-wrap gap-2">
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
				</InputGroup.Addon>
			{/if}
			<!-- The base textarea is `field-sizing-content` with no ceiling, so a long draft
		     grows until it owns the panel. The cap turns it into an internal scroll; the
		     `@layer base` scrollbar rules already style it to match the ScrollArea panes. -->
			<InputGroup.Textarea
				id="chat-composer"
				bind:value={prompt}
				bind:ref={textareaRef}
				placeholder="Ask the agent… (@ to add context)"
				rows={2}
				class="max-h-56 min-h-16 px-3 overflow-y-auto"
				{onkeydown}
				{oninput}
				{onpaste}
				disabled={!agentAvailable}
			/>
			<!--
				One rule for this row: the model name is the only thing whose length varies, so
				it is the only thing allowed to give. Everything else holds its size. Without
				that, `buttonVariants` makes every control `shrink-0` and the row simply
				overflows — the send button ended up sitting on the box's right border.
			-->
			<InputGroup.Addon align="block-end" class="gap-2">
				<Tip text="Attach images">
					{#snippet children({ props })}
						<Label
							{...props}
							for="chat-composer-attach"
							class="tactile inline-flex size-8 shrink-0 items-center justify-center rounded-md"
							aria-label="Attach images"
						>
							<Paperclip class="size-4" />
						</Label>
					{/snippet}
				</Tip>
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
								: 'text-muted-foreground group-has-[[data-slot=input-group-control]:focus-visible]/input-group:text-brand-muted-foreground'}
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
				<!--
					One `ml-auto`, on the group rather than on whichever member happens to be
					rendered. Three conditional members each claiming it is how the row jumped
					when a run started.
				-->
				<div class="ml-auto flex min-w-0 shrink items-center gap-2">
					<Badge
						variant="secondary"
						class={isStreaming && connection !== 'connected' ? 'shrink-0' : 'hidden'}
						aria-live="polite"
					>
						{connection === 'offline' ? 'Offline · run continues' : 'Reconnecting'}
					</Badge>
					<!--
						A run in flight, in the toolbar's own quiet register. The stop button says
						the same thing, but it is a control the eye skips over; this is the part
						that reads as motion.
					-->
					{#if isStreaming && connection === 'connected'}
						<Loader
							class="size-4 animate-spin text-muted-foreground group-has-[[data-slot=input-group-control]:focus-visible]/input-group:text-brand-muted-foreground"
							aria-hidden="true"
						/>
					{/if}
					<ModelInlinePicker
						{models}
						value={modelOverride}
						{defaultModelId}
						visionValue={visionModelOverride}
						{defaultVisionModelId}
						disabled={!agentAvailable}
						onchange={onmodelchange}
						onvisionchange={onvisionmodelchange}
					/>
					<Button
						size="icon-sm"
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
			</InputGroup.Addon>
		</InputGroup.Root>
	</div>
</div>
