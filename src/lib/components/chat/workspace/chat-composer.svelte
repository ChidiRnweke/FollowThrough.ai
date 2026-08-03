<script lang="ts">
	import type { AgentExecutionMode, ConversationImageInput } from '$lib/models/agent';
	import type { ContextChip } from '$lib/stores/agent/chat.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtSend as SendHorizontal,
		FtDocument as FileText,
		FtFolder as Folder,
		FtSkills as Wrench,
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
	<Badge variant="secondary" class="max-w-44 gap-1 pr-1">
		{#if chip.kind === 'skill'}
			<Wrench class="size-3 shrink-0" />
		{:else if chip.kind === 'folder'}
			<Folder class="size-3 shrink-0" />
		{:else}
			<FileText class="size-3 shrink-0" />
		{/if}
		<span class="truncate">{chip.name}</span>
		{#if chip.kind === 'folder'}
			<span class="shrink-0 text-xs text-muted-foreground">
				{chip.noteCount === 1 ? '1 note' : `${chip.noteCount ?? 0} notes`}
			</span>
		{/if}
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label="Remove {chip.name} from context"
			onclick={() => onremovechip(chip, automatic)}
		>
			<X />
		</Button>
	</Badge>
{/snippet}

{#if autoChip || chips.length > 0}
	<div class="flex flex-wrap items-center gap-1" aria-label="Chat context">
		{#if autoChip}
			{@render chipBadge(autoChip, true)}
		{/if}
		{#each chips as chip (chip.kind + chip.id)}
			{@render chipBadge(chip, false)}
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
					class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm {index === highlighted
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
						{candidate.kind === 'skill' ? 'Skill' : candidate.kind === 'folder' ? 'Folder' : 'Note'}
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
	<Textarea
		id="chat-composer"
		bind:value={prompt}
		bind:ref={textareaRef}
		placeholder="Ask the agent… (@ to add context)"
		rows={2}
		class="min-h-16 resize-none"
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
			disabled={!agentAvailable || (!isStreaming && prompt.trim() === '' && !selectedImages.length)}
		>
			{#if isStreaming}
				<Square />
			{:else}
				<SendHorizontal class="size-4" />
			{/if}
		</Button>
	</div>
</div>
