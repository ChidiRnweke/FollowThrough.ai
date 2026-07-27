<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type {
		AgentPreferences,
		Conversation,
		NoteId,
		ProjectId,
		RunAgentInput,
		ShellContext
	} from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		FtSend as SendHorizontal,
		FtChevronRight as ChevronRight,
		FtDocument as FileText,
		FtLoader as LoaderCircle,
		FtCopy as Copy,
		FtEdit as Pencil,
		FtRefresh as RotateCcw,
		FtStop as Square,
		FtSkills as Wrench,
		FtCheck as Check,
		FtWorkflow as Workflow,
		FtClose as X
	} from '$lib/components/icons';
	import { Tip } from '$lib/components/ui/tooltip';
	import { chat, entryText, type ChatEntry, type ContextChip } from '$lib/stores/chat.svelte';
	import { editorSelectionRegistry } from '$lib/stores/registries/editor-selection-registry.svelte';
	import { suggestionTrayRegistry } from '$lib/stores/registries/suggestion-tray-registry.svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { toast } from 'svelte-sonner';
	import SuggestionCard from '../suggestion-card.svelte';
	import ChatMarkdown from '$lib/components/app/agent/chat-markdown.svelte';
	import ChatHistoryList from './chat-history-list.svelte';
	import ChatActivity from '$lib/components/app/agent/chat-activity.svelte';
	import ChatStarters from '$lib/components/app/agent/chat-starters.svelte';
	import AgentContextBar from '$lib/components/app/agent/agent-context-bar.svelte';
	import ToolApprovalCard from '$lib/components/app/agent/tool-approval-card.svelte';
	import {
		isWriteTool,
		toolDetailLines,
		toolStatusLabel
	} from '$lib/components/app/agent/tool-presentation';
	import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions.remote';
	import { invalidateAll } from '$app/navigation';
	import { consumeChatHandoff, type ChatHandoff } from '$lib/stores/chat-handoff';

	let {
		shell,
		sessions,
		activeNoteId,
		activeProjectId,
		initialConversationId,
		showHistory = true,
		agentPreferences,
		agentAvailable
	}: {
		shell?: ShellContext;
		sessions: readonly Conversation[];
		activeNoteId?: NoteId;
		activeProjectId?: ProjectId;
		initialConversationId?: Conversation['id'] | null;
		showHistory?: boolean;
		agentPreferences: AgentPreferences;
		agentAvailable: boolean;
	} = $props();
	$effect(() => chat.persistConversationChoices());
	onMount(() => {
		const release = chat.observe();
		chat.initialize(agentPreferences.executionMode);
		if (initialConversationId === null) chat.clear();
		else if (initialConversationId) void chat.switchToConversation(initialConversationId);
		else void chat.hydrate();
		const staged = consumeChatHandoff();
		if (staged) prefill(staged);
		else prompt = sessionStorage.getItem(draftKey()) ?? '';
		return release;
	});

	// An invocation point elsewhere in the app wrote a prompt while this panel was
	// already mounted (the docked case, where `onMount` above has long since run).
	$effect(() => {
		const request = chat.staged;
		if (!request) return;
		chat.staged = undefined;
		prefill(request);
	});

	/**
	 * Put the sentence in the composer and hand over the caret — deliberately without
	 * sending. Reading the prompt is how the invocation points teach what the agent
	 * can be asked for, and an edit is always one keystroke away.
	 */
	function prefill(request: ChatHandoff): void {
		prompt = request.prompt;
		handoff = request;
		saveDraft();
		// The textarea may not be bound yet on the mount path, so go through the tick
		// rather than `textareaRef` directly.
		void tick().then(() => {
			const node = textareaRef;
			if (!node) return;
			node.focus();
			node.setSelectionRange(node.value.length, node.value.length);
		});
	}

	let prompt = $state('');
	let handoff = $state<ChatHandoff | undefined>(undefined);
	let viewport = $state<HTMLElement | null>(null);
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let followingLatest = $state(true);
	let showJumpToLatest = $state(false);
	const draftKey = (): string => `followthrough.chat.draft.${chat.conversationId ?? 'new'}`;

	function saveDraft(): void {
		if (typeof sessionStorage === 'undefined') return;
		if (prompt) sessionStorage.setItem(draftKey(), prompt);
		else sessionStorage.removeItem(draftKey());
	}

	$effect(() => {
		const node = viewport;
		if (!node) return;
		// Only a viewport that actually overflows can be scrolled away from, and only
		// a thread with turns in it has a latest turn to jump to. Overflow alone was
		// not enough: the empty state's own starters and history overflow the panel,
		// which raised the button over a thread that had nothing below.
		const scrollable = () => node.scrollHeight > node.clientHeight && chat.entries.length > 0;
		const updatePosition = () => {
			followingLatest = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
			showJumpToLatest = !followingLatest && scrollable();
		};
		const observer = new MutationObserver(() => {
			if (followingLatest) node.scrollTo({ top: node.scrollHeight });
			else showJumpToLatest = scrollable();
		});
		node.addEventListener('scroll', updatePosition, { passive: true });
		observer.observe(node, { childList: true, subtree: true, characterData: true });
		return () => {
			node.removeEventListener('scroll', updatePosition);
			observer.disconnect();
		};
	});

	function jumpToLatest(): void {
		followingLatest = true;
		showJumpToLatest = false;
		viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
	}

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

	/**
	 * The context a prompt travels with — open note, project, editor selection,
	 * handoff. Shared by the composer and by resubmitting an edited question, so an
	 * edited turn is grounded exactly like a freshly typed one.
	 */
	function requestFor(text: string): Omit<RunAgentInput, 'conversationId'> {
		// Read the focused pane's editor selection; falls back to undefined
		// when no pane is mounted (e.g. a fresh `/chats/new` page).
		const interactionNoteId = workbench.interactionFocusedNoteId ?? workbench.focusedNoteId;
		const selection = interactionNoteId
			? editorSelectionRegistry.peek(interactionNoteId)?.current
			: undefined;
		const interactionProjectId = interactionNoteId
			? (shell?.noteTree.find((entry) => entry.id === interactionNoteId)?.projectId as
					ProjectId | undefined)
			: activeProjectId;
		return {
			prompt: text,
			modelOverride: chat.modelOverride,
			executionModeOverride: chat.executionModeOverride,
			...(handoff?.noteId !== undefined
				? { noteId: handoff.noteId }
				: interactionNoteId !== undefined
					? { noteId: interactionNoteId }
					: {}),
			...(handoff?.projectId !== undefined
				? { projectId: handoff.projectId }
				: interactionProjectId !== undefined
					? { projectId: interactionProjectId }
					: {}),
			...(autoChip !== undefined ? { contextNoteIds: [autoChip.id] } : {}),
			...(handoff?.selection !== undefined
				? { selection: handoff.selection, noteId: handoff.selection.noteId }
				: selection !== undefined
					? { selection, noteId: selection.noteId }
					: {}),
			...(handoff?.requestedSkillNames
				? { requestedSkillNames: [...handoff.requestedSkillNames] }
				: {})
		};
	}

	async function send(): Promise<void> {
		const text = prompt.trim();
		if (!text || chat.isStreaming) return;
		prompt = '';
		saveDraft();
		const request = chat.send(requestFor(text));
		handoff = undefined;
		await tick();
		if (followingLatest) viewport?.scrollTo({ top: viewport.scrollHeight });
		await request;
	}

	// --- editing a question that was already asked ---

	let editingId = $state<string | undefined>(undefined);
	let editDraft = $state('');

	// Hoisted so the attachment is a stable reference: an inline closure would be
	// recreated on every keystroke and drag the caret back to the end each time.
	const focusAtEnd = (node: HTMLTextAreaElement): void => {
		node.focus();
		node.setSelectionRange(node.value.length, node.value.length);
	};

	function startEditing(entry: ChatEntry): void {
		editingId = entry.id;
		editDraft = entryText(entry);
	}

	function cancelEditing(): void {
		editingId = undefined;
		editDraft = '';
	}

	/**
	 * Send an already-asked question again, edited or not. Everything from that turn
	 * onwards is discarded, here and on the server, so the thread reads as though the
	 * question had been asked this way the first time.
	 */
	async function resubmit(entry: ChatEntry, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		cancelEditing();
		const started = await chat.resubmit(entry, requestFor(trimmed));
		if (!started) {
			toast.error(
				chat.isStreaming ? 'Wait for the current answer to finish.' : 'That could not be resent.'
			);
			return;
		}
		await tick();
		if (followingLatest) viewport?.scrollTo({ top: viewport.scrollHeight });
	}

	function askAgain(reply: ChatEntry): void {
		const question = chat.precedingUserEntry(reply);
		if (!question) {
			toast.error('The question behind this answer is no longer in the thread.');
			return;
		}
		void resubmit(question, entryText(question));
	}

	function handleEditKeydown(event: KeyboardEvent, entry: ChatEntry): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelEditing();
			return;
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void resubmit(entry, editDraft);
		}
	}

	async function copyMessage(entry: ChatEntry): Promise<void> {
		await navigator.clipboard.writeText(entryText(entry));
		toast.success('Copied to clipboard.');
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

	async function decide(id: string, decision: 'accept' | 'reject') {
		const tray = workbench.focusedNoteId
			? suggestionTrayRegistry.peek(workbench.focusedNoteId)
			: undefined;
		// The tray only exists while a note pane is mounted. In the right panel there
		// often is none, and routing through it there rejected every decision — so
		// fall back to the controller, which is what the tray calls anyway.
		const ok = tray ? await tray.decide(id as never, decision) : await decideDirectly(id, decision);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}

	async function decideDirectly(id: string, decision: 'accept' | 'reject'): Promise<boolean> {
		try {
			if (decision === 'accept') await acceptSuggestion({ suggestionId: id });
			else await rejectSuggestion({ suggestionId: id });
			chat.resolveSuggestion(id);
			await invalidateAll();
			return true;
		} catch {
			return false;
		}
	}

	async function requestRetry(entry: ChatEntry): Promise<void> {
		try {
			await chat.retry(entry);
		} catch {
			toast.error('That run could not be retried.');
		}
	}

	function useStarter(text: string): void {
		prompt = text;
		saveDraft();
		textareaRef?.focus();
	}

	function toggleExecutionMode(): void {
		chat.executionModeOverride =
			chat.executionModeOverride === 'auto_accept' ? 'approval_required' : 'auto_accept';
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

	<!-- One instance, always mounted above the transcript, so the collapse into the
	     compact row is one element changing size rather than two unrelated ones
	     swapping. In the empty state it is the first group and the padding below
	     stands in for the flex gap it used to get from its siblings. -->
	<div class={chat.entries.length === 0 ? 'pb-8' : ''}>
		<AgentContextBar {shell} {activeProjectId} {activeNoteId} compact={chat.entries.length > 0} />
	</div>
	<ScrollArea class="min-h-0 flex-1 pr-2 " bind:viewportRef={viewport}>
		<!-- `min-h-full` resolves because bits-ui's viewport is a flex column and its
		     content child grows into it; it is what lets the empty state sink its
		     history to the foot of the panel. -->
		<div class="flex min-h-full flex-col gap-3">
			{#if chat.entries.length === 0}
				<!--
					Groups held apart by spacing rather than boxes: what the agent can see
					(the context bar, just above this scroll area), what to set it to work
					on, and where you left off. The panel does not explain in prose that the
					open note travels along — the context chip above the composer and the
					placeholder show it.

					Everything stacks from the head of the panel and the slack falls at the
					foot, above the composer. Pushing the groups apart to fill the panel —
					by a `lg:pt-32` or by `justify-between` — reads as a hole in the middle
					rather than as air, because there is nothing between them to look at.
					The steps do the grouping instead: 40px from the context bar to the
					starters, 56px down to history, which is the quietest thing here.
				-->
				<ChatStarters
					hasNote={activeNoteId !== undefined}
					hasProject={activeProjectId !== undefined}
					onpick={useStarter}
				/>
				{#if showHistory && sessions.length > 0}
					<div class="pt-14">
						<ChatHistoryList
							{sessions}
							{shell}
							limit={3}
							density="compact"
							onselect={(id) => void chat.switchToConversation(id)}
						/>
					</div>
				{/if}
			{/if}
			{#each chat.entries as entry (entry.id)}
				<div class="group/turn flex flex-col gap-1.5">
					<p class="provenance-caption">{entry.role === 'user' ? 'You' : 'Agent'}</p>
					{#if editingId === entry.id}
						<!-- Editing happens where the question is, not in the composer: the
						     turn being replaced has to stay in view while it is rewritten. -->
						<div class="flex flex-col gap-1.5">
							<Textarea
								bind:value={editDraft}
								rows={2}
								class="min-h-16 resize-none"
								aria-label="Edit question"
								onkeydown={(event) => handleEditKeydown(event, entry)}
								{@attach focusAtEnd}
							/>
							<div class="flex items-center gap-1.5">
								<Button size="xs" onclick={() => void resubmit(entry, editDraft)}>Resubmit</Button>
								<Button variant="ghost" size="xs" onclick={cancelEditing}>Cancel</Button>
								<span class="text-xs text-muted-foreground">
									Replaces everything below this question.
								</span>
							</div>
						</div>
					{/if}
					{#each entry.parts as part, index (part.kind === 'tool' && part.tool.callId ? part.tool.callId : `${entry.id}-${index}`)}
						{#if part.kind === 'text'}
							<!-- While the editor is open it stands in for the prose it replaces. -->
							{#if part.text && editingId !== entry.id}
								<ChatMarkdown content={part.text} />
							{/if}
						{:else}
							{@const tool = part.tool}
							{#if tool.status === 'approval_required'}
								<ToolApprovalCard
									{tool}
									onapprove={() => void chat.decide(entry, tool, 'approve')}
									onreject={() => void chat.decide(entry, tool, 'reject')}
								/>
							{:else}
								<Collapsible.Root>
									<Collapsible.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="sm"
												class="h-7 gap-1 px-1.5 text-xs [&[data-state=open]>svg]:rotate-90 {isWriteTool(
													tool.name
												)
													? 'text-foreground'
													: 'text-muted-foreground'}"
											>
												<ChevronRight
													class="size-3.5 transition-transform duration-(--duration-micro)"
												/>
												{#if tool.status === 'running'}
													<LoaderCircle class="size-3.5 animate-spin" />
												{/if}
												{toolStatusLabel(tool)}
											</Button>
										{/snippet}
									</Collapsible.Trigger>
									<Collapsible.Content>
										<ul class="flex flex-col gap-0.5 pl-6 text-xs text-muted-foreground">
											{#each toolDetailLines(tool) as line, lineIndex (lineIndex)}
												<li class="break-words">{line}</li>
											{/each}
										</ul>
									</Collapsible.Content>
								</Collapsible.Root>
							{/if}
						{/if}
					{/each}
					{#if entry.role === 'assistant' && entry.status === 'queued'}
						<ChatActivity label={entry.error ?? 'Queued'} />
					{:else if entry.role === 'assistant' && entry.status === 'waiting'}
						<ChatActivity />
					{:else if entry.role === 'assistant' && entry.status === 'streaming' && !entry.parts.some((part) => part.kind === 'text')}
						<ChatActivity
							label="Agent is working"
							toolActive={entry.parts.some((part) => part.kind === 'tool')}
						/>
					{:else if entry.role === 'assistant' && entry.status === 'cancelling'}
						<ChatActivity label="Cancellation requested" />
					{:else if entry.role === 'assistant' && (entry.status === 'failed' || entry.status === 'cancelled')}
						<div class="flex items-center gap-2 text-xs text-destructive" role="alert">
							<span
								>{entry.error ??
									(entry.status === 'cancelled' ? 'Generation stopped' : 'The run failed.')}</span
							>
							{#if entry.status === 'failed' && entry.retryable && entry.runId}
								<Button variant="outline" size="xs" onclick={() => void requestRetry(entry)}>
									<RotateCcw data-icon="inline-start" /> Retry
								</Button>
							{/if}
						</div>
					{/if}
					<!--
						Actions belong under the thing they act on, aligned with it, and stay
						hidden until the turn is hovered or tabbed into so a long thread is
						not a wall of buttons. Tooltips point up, over the message the
						buttons came from rather than over the turn below.
					-->
					{#if editingId !== entry.id && entryText(entry)}
						<div
							class="flex items-center gap-1 opacity-0 transition-opacity duration-(--duration-micro) group-hover/turn:opacity-100 focus-within:opacity-100"
						>
							<Tip text="Copy">
								{#snippet children({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-xs"
										aria-label="Copy message"
										onclick={() => void copyMessage(entry)}
									>
										<Copy />
									</Button>
								{/snippet}
							</Tip>
							{#if entry.role === 'user'}
								<Tip text="Edit and resubmit">
									{#snippet children({ props })}
										<Button
											{...props}
											variant="ghost"
											size="icon-xs"
											aria-label="Edit and resubmit question"
											disabled={chat.isStreaming}
											onclick={() => startEditing(entry)}
										>
											<Pencil />
										</Button>
									{/snippet}
								</Tip>
							{:else if entry.status === 'completed'}
								<Tip text="Ask again">
									{#snippet children({ props })}
										<Button
											{...props}
											variant="ghost"
											size="icon-xs"
											aria-label="Ask again"
											disabled={chat.isStreaming}
											onclick={() => askAgain(entry)}
										>
											<RotateCcw />
										</Button>
									{/snippet}
								</Tip>
							{/if}
						</div>
					{/if}
					{#each entry.suggestions as view (view.suggestion.id)}
						<SuggestionCard
							{view}
							busy={(workbench.focusedNoteId &&
								suggestionTrayRegistry
									.peek(workbench.focusedNoteId)
									?.busyIds.includes(view.suggestion.id)) ??
								false}
							onaccept={(id) => decide(id, 'accept')}
							onreject={(id) => decide(id, 'reject')}
						/>
					{/each}
				</div>
			{/each}
		</div>
	</ScrollArea>
	{#if showJumpToLatest}
		<Button variant="outline" size="sm" class="self-end" onclick={jumpToLatest}
			>Jump to latest</Button
		>
	{/if}
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
	<div class="relative flex flex-col gap-1">
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
			oninput={saveDraft}
			disabled={!agentAvailable}
		/>
		<div class="flex items-center gap-2">
			<!--
				Auto-accept lets the agent change notes and todos without asking, so it
				stays legible in the composer rather than moving into the gear with the
				model. Quiet when approval is required, accented when it is not.
			-->
			<Tip
				text={chat.executionModeOverride === 'auto_accept'
					? 'The agent applies changes without asking. Click to require approval.'
					: 'The agent asks before it changes anything. Click to auto-accept.'}
			>
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="xs"
						aria-pressed={chat.executionModeOverride === 'auto_accept'}
						class={chat.executionModeOverride === 'auto_accept'
							? 'bg-brand/10 text-brand dark:bg-brand/15'
							: 'text-muted-foreground'}
						onclick={toggleExecutionMode}
					>
						{#if chat.executionModeOverride === 'auto_accept'}
							<Workflow data-icon="inline-start" /> Auto-accept
						{:else}
							<Check data-icon="inline-start" /> Approval
						{/if}
					</Button>
				{/snippet}
			</Tip>
			<Badge
				variant="secondary"
				class={chat.isStreaming && chat.connection !== 'connected' ? undefined : 'hidden'}
				aria-live="polite"
			>
				{chat.connection === 'offline' ? 'Offline · run continues' : 'Reconnecting'}
			</Badge>
			<Button
				size="icon-sm"
				class="ml-auto"
				aria-label={chat.isStreaming ? 'Stop generation' : 'Send message'}
				onclick={() => (chat.isStreaming ? void chat.stop() : void send())}
				disabled={!agentAvailable || (!chat.isStreaming && prompt.trim() === '')}
			>
				{#if chat.isStreaming}
					<Square />
				{:else}
					<SendHorizontal class="size-4" />
				{/if}
			</Button>
		</div>
	</div>
</div>
