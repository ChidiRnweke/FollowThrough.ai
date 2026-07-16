<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { AgentModel, AgentPreferences, NoteId, ShellContext } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Wrench from '@lucide/svelte/icons/wrench';
	import X from '@lucide/svelte/icons/x';
	import { chat, type ContextChip } from '$lib/stores/chat.svelte';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import { toast } from 'svelte-sonner';
	import SuggestionCard from '../suggestion-card.svelte';
	import ModelPicker from '$lib/components/app/agent/model-picker.svelte';
	import ExecutionModeControl from '$lib/components/app/agent/execution-mode-control.svelte';
	import ChatMarkdown from '$lib/components/app/agent/chat-markdown.svelte';

	let {
		shell,
		activeNoteId,
		agentPreferences,
		agentModels,
		agentAvailable
	}: {
		shell?: ShellContext;
		activeNoteId?: NoteId;
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentAvailable: boolean;
	} = $props();
	$effect(() => chat.persistConversationChoices());
	onMount(() => {
		chat.initialize(agentPreferences.executionMode);
		void chat.hydrate();
	});

	let prompt = $state('');
	let viewport = $state<HTMLElement | null>(null);
	let textareaRef = $state<HTMLTextAreaElement | null>(null);

	// The open note travels along automatically, like Copilot's current file.
	const autoChip = $derived.by((): ContextChip | undefined => {
		if (!activeNoteId || chat.autoChipDismissedFor === activeNoteId) return undefined;
		if (chat.chips.some((chip) => chip.kind === 'note' && chip.id === activeNoteId))
			return undefined;
		const note = shell?.noteTree.find((entry) => entry.id === activeNoteId);
		return note ? { kind: 'note', id: note.id, name: note.title } : undefined;
	});

	// --- @ mention picker ---

	const MENTION_PATTERN = /(^|\s)@([^\s@]*)$/;
	const mentionQuery = $derived(MENTION_PATTERN.exec(prompt)?.[2]);
	let highlighted = $state(0);

	const mentionCandidates = $derived.by((): ContextChip[] => {
		if (mentionQuery === undefined || !shell) return [];
		const query = mentionQuery.toLowerCase();
		const notes = shell.noteTree
			.filter(
				(note) =>
					note.kind !== 'folder' && !note.archivedAt && note.title.toLowerCase().includes(query)
			)
			.slice(0, 6)
			.map((note): ContextChip => ({ kind: 'note', id: note.id, name: note.title }));
		const skills = shell.skills
			.filter((skill) => skill.name.toLowerCase().includes(query))
			.slice(0, 4)
			.map((skill): ContextChip => ({ kind: 'skill', id: skill.noteId, name: skill.name }));
		return [...notes, ...skills];
	});

	$effect(() => {
		void mentionQuery;
		highlighted = 0;
	});

	function pick(candidate: ContextChip): void {
		prompt = prompt.replace(MENTION_PATTERN, '$1');
		chat.addChip(candidate);
		textareaRef?.focus();
	}

	async function send(): Promise<void> {
		const text = prompt.trim();
		if (!text || chat.isStreaming) return;
		prompt = '';
		const selection = editorSelection.current;
		const request = chat.send({
			prompt: text,
			modelOverride: chat.modelOverride,
			executionModeOverride: chat.executionModeOverride,
			...(activeNoteId !== undefined ? { noteId: activeNoteId } : {}),
			...(autoChip !== undefined ? { contextNoteIds: [autoChip.id] } : {}),
			...(selection !== undefined ? { selection, noteId: selection.noteId } : {})
		});
		await tick();
		viewport?.scrollTo({ top: viewport.scrollHeight });
		await request;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (mentionCandidates.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				highlighted = (highlighted + 1) % mentionCandidates.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				highlighted = (highlighted - 1 + mentionCandidates.length) % mentionCandidates.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				const candidate = mentionCandidates[highlighted];
				if (candidate) pick(candidate);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				prompt = prompt.replace(MENTION_PATTERN, '$1');
				return;
			}
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void send();
		}
	}

	async function decide(
		id: Parameters<typeof suggestionTray.decide>[0],
		decision: 'accept' | 'reject'
	) {
		const ok = await suggestionTray.decide(id, decision);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}
</script>

{#snippet chipBadge(chip: ContextChip, auto: boolean)}
	<Badge variant="secondary" class="max-w-44 gap-1 pr-1">
		{#if chip.kind === 'skill'}
			<Wrench class="size-3 shrink-0" />
		{:else}
			<FileText class="size-3 shrink-0" />
		{/if}
		<span class="truncate">{chip.name}</span>
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label="Remove {chip.name} from context"
			onclick={() => {
				if (auto) chat.autoChipDismissedFor = chip.id;
				else chat.removeChip(chip);
			}}
		>
			<X />
		</Button>
	</Badge>
{/snippet}

<div class="flex h-full min-h-0 flex-col gap-2">
	{#if !agentAvailable}
		<div class="rounded-md border border-border bg-muted/50 p-3 text-sm" role="status">
			Agent chat is disabled. Configure <code class="font-mono text-xs">OPENROUTER_API_KEY</code> to enable
			it.
		</div>
	{/if}
	<ScrollArea class="min-h-0 flex-1 pr-2" bind:viewportRef={viewport}>
		<div class="flex flex-col gap-3">
			{#if chat.entries.length === 0}
				<p class="text-sm text-muted-foreground">
					Ask about your projects, notes and todos. The open note and your selection travel along —
					type <Kbd>@</Kbd> to add notes or invoke skills.
				</p>
			{/if}
			{#each chat.entries as entry (entry.id)}
				<div class="space-y-1.5">
					<p class="provenance-caption">{entry.role === 'user' ? 'You' : 'Agent'}</p>
					{#each entry.parts as part, index (part.kind === 'tool' && part.tool.callId ? part.tool.callId : `${entry.id}-${index}`)}
						{#if part.kind === 'text'}
							{#if part.text}
								<ChatMarkdown content={part.text} />
							{/if}
						{:else}
							{@const tool = part.tool}
							{#if tool.status === 'approval_required'}
								<Card.Root>
									<Card.Header>
										<Card.Title class="text-sm">Approve {tool.name}?</Card.Title>
										<Card.Description>This action changes saved workspace data.</Card.Description>
									</Card.Header>
									<Card.Content>
										<pre class="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(
												tool.arguments,
												null,
												2
											)}</pre>
									</Card.Content>
									<Card.Footer class="gap-2">
										<Button size="sm" onclick={() => void chat.decide(entry, tool, 'approve')}
											>Approve</Button
										>
										<Button
											size="sm"
											variant="outline"
											onclick={() => void chat.decide(entry, tool, 'reject')}>Reject</Button
										>
									</Card.Footer>
								</Card.Root>
							{:else}
								<Collapsible.Root>
									<Collapsible.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="sm"
												class="h-7 gap-1 px-1.5 text-xs text-muted-foreground [&[data-state=open]>svg]:rotate-90"
											>
												<ChevronRight
													class="size-3.5 transition-transform duration-(--duration-micro)"
												/>
												{#if tool.status === 'running'}
													<LoaderCircle class="size-3.5 animate-spin" />
												{/if}
												{tool.name} · {tool.status}
											</Button>
										{/snippet}
									</Collapsible.Trigger>
									<Collapsible.Content>
										<p class="pl-6 text-xs text-muted-foreground">
											Tool {tool.name} · {tool.status === 'running' ? 'running' : 'completed'}
										</p>
									</Collapsible.Content>
								</Collapsible.Root>
							{/if}
						{/if}
					{/each}
					{#each entry.suggestions as view (view.suggestion.id)}
						<SuggestionCard
							{view}
							busy={suggestionTray.busyIds.includes(view.suggestion.id)}
							onaccept={(id) => decide(id, 'accept')}
							onreject={(id) => decide(id, 'reject')}
						/>
					{/each}
				</div>
			{/each}
		</div>
	</ScrollArea>
	{#if autoChip || chat.chips.length > 0}
		<div class="flex flex-wrap items-center gap-1" aria-label="Chat context">
			{#if autoChip}
				{@render chipBadge(autoChip, true)}
			{/if}
			{#each chat.chips as chip (chip.kind + chip.id)}
				{@render chipBadge(chip, false)}
			{/each}
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-2" aria-label="Chat model and execution mode">
		<ModelPicker models={agentModels} bind:value={chat.modelOverride} allowDefault compact />
		<ExecutionModeControl bind:value={chat.executionModeOverride} compact />
	</div>
	<div class="relative flex items-end gap-2">
		{#if mentionCandidates.length > 0}
			<div
				class="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-md"
				role="listbox"
				aria-label="Mention a note or skill"
			>
				{#each mentionCandidates as candidate, index (candidate.kind + candidate.id)}
					<button
						type="button"
						role="option"
						aria-selected={index === highlighted}
						class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm {index ===
						highlighted
							? 'bg-accent text-accent-foreground'
							: ''}"
						onpointerenter={() => (highlighted = index)}
						onclick={() => pick(candidate)}
					>
						{#if candidate.kind === 'skill'}
							<Wrench class="size-3.5 shrink-0 text-muted-foreground" />
						{:else}
							<FileText class="size-3.5 shrink-0 text-muted-foreground" />
						{/if}
						<span class="truncate">{candidate.name}</span>
						<span class="ml-auto text-xs text-muted-foreground">
							{candidate.kind === 'skill' ? 'Skill' : 'Note'}
						</span>
					</button>
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
			onkeydown={handleKeydown}
			disabled={chat.isStreaming || !agentAvailable}
		/>
		<Button
			size="icon"
			aria-label="Send message"
			onclick={() => void send()}
			disabled={chat.isStreaming || !agentAvailable || prompt.trim() === ''}
		>
			{#if chat.isStreaming}
				<LoaderCircle class="size-4 animate-spin" />
			{:else}
				<SendHorizontal class="size-4" />
			{/if}
		</Button>
	</div>
</div>
