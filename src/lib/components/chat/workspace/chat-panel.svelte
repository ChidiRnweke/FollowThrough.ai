<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type {
		AgentPreferences,
		ConversationImageInput,
		Conversation,
		RunAgentInput
	} from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import type { ShellContext } from '$lib/models/workspace';
	import { chat, entryText, type ChatEntry, type ContextChip } from '$lib/stores/agent/chat.svelte';
	import { editorSelectionRegistry } from '$lib/stores/notes/registries/editor-selection-registry.svelte';
	import { suggestionTrayRegistry } from '$lib/stores/notes/registries/suggestion-tray-registry.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { toast } from 'svelte-sonner';
	import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';
	import { invalidateAll } from '$app/navigation';
	import { consumeChatHandoff, type ChatHandoff } from '$lib/stores/agent/chat-handoff';
	import ChatComposer from './chat-composer.svelte';
	import ChatThread from './chat-thread.svelte';
	import {
		MENTION_PATTERN,
		folderNoteIds,
		liveChips,
		mentionCandidatesFor,
		mentionQueryOf,
		withMention,
		withoutMention
	} from './mentions';

	let {
		shell,
		sessions,
		activeNoteId,
		activeProjectId,
		initialConversationId,
		showHistory = true,
		agentPreferences,
		agentAvailable,
		registerComposerFocus
	}: {
		shell?: ShellContext;
		sessions: readonly Conversation[];
		activeNoteId?: NoteId;
		activeProjectId?: ProjectId;
		initialConversationId?: Conversation['id'] | null;
		showHistory?: boolean;
		agentPreferences: AgentPreferences;
		agentAvailable: boolean;
		registerComposerFocus?: (focus: () => void) => () => void;
	} = $props();
	$effect(() => chat.persistConversationChoices());
	onMount(() => {
		const release = chat.observe();
		const releaseComposerFocus = registerComposerFocus?.(() => textareaRef?.focus());
		chat.initialize(agentPreferences.executionMode);
		if (initialConversationId === null) chat.clear();
		else if (initialConversationId) void chat.switchToConversation(initialConversationId);
		else void chat.hydrate();
		const staged = consumeChatHandoff();
		if (staged) prefill(staged);
		else prompt = sessionStorage.getItem(draftKey()) ?? '';
		return () => {
			release();
			releaseComposerFocus?.();
		};
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
	let selectedImages = $state<ConversationImageInput[]>([]);
	const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

	async function addImages(files: readonly File[]): Promise<void> {
		const accepted = files.filter((file) => IMAGE_TYPES.has(file.type));
		if (selectedImages.length + accepted.length > 4) {
			toast.error('Attach at most four images.');
			return;
		}
		if (
			[...selectedImages].reduce((sum, image) => sum + image.dataUrl.length, 0) +
				accepted.reduce((sum, file) => sum + file.size, 0) >
			10 * 1024 * 1024
		) {
			toast.error('Images must be 10 MiB combined or less.');
			return;
		}
		for (const file of accepted) {
			const dataUrl = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(reader.error);
				reader.readAsDataURL(file);
			});
			selectedImages.push({
				id: crypto.randomUUID(),
				mediaType: file.type as ConversationImageInput['mediaType'],
				dataUrl,
				name: file.name || 'Pasted image'
			});
		}
	}

	function pasteImages(event: ClipboardEvent): void {
		const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
			IMAGE_TYPES.has(file.type)
		);
		if (!images.length) return;
		event.preventDefault();
		void addImages(images);
	}
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

	const mentionQuery = $derived(mentionQueryOf(prompt));
	let highlighted = $state(0);

	const mentionCandidates = $derived(
		mentionQuery === undefined || !shell
			? []
			: mentionCandidatesFor(mentionQuery, shell.noteTree, shell.skills)
	);

	$effect(() => {
		void mentionQuery;
		highlighted = 0;
	});

	/** The tag stays in the sentence; the chip is the same choice, shown as a badge. */
	function pick(candidate: ContextChip): void {
		prompt = withMention(prompt, candidate);
		chat.addChip(candidate);
		textareaRef?.focus();
	}

	function unpick(chip: ContextChip): void {
		prompt = withoutMention(prompt, chip);
		chat.removeChip(chip);
	}

	/**
	 * The text rules: a chip whose tag the user has typed away is no longer attached.
	 * Done on input rather than in an `$effect` so clearing the prompt to send does
	 * not drop the chips out from under the request being built.
	 */
	function handleInput(): void {
		saveDraft();
		const live = liveChips(prompt, chat.chips);
		const stale = chat.chips.filter(
			(chip) => !live.some((kept) => kept.kind === chip.kind && kept.id === chip.id)
		);
		for (const chip of stale) chat.removeChip(chip);
	}

	/**
	 * The context a prompt travels with — open note, project, editor selection,
	 * handoff. Shared by the composer and by resubmitting an edited question, so an
	 * edited turn is grounded exactly like a freshly typed one.
	 */
	function requestFor(text: string): Omit<RunAgentInput, 'conversationId'> {
		const folderNotes = shell
			? chat.chips
					.filter((chip) => chip.kind === 'folder')
					.flatMap((chip) => folderNoteIds(shell.noteTree, chip.id))
			: [];
		const contextNoteIds = [
			...new Set([...(autoChip ? [autoChip.id] : []), ...folderNotes])
		] as NoteId[];
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
			...(selectedImages.length ? { images: selectedImages } : {}),
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
			// A tagged folder rides in as the notes inside it; the store unions these
			// with the note chips it maps itself.
			...(contextNoteIds.length ? { contextNoteIds } : {}),
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
		if ((!text && !selectedImages.length) || chat.isStreaming) return;
		const sentImages = selectedImages;
		prompt = '';
		selectedImages = [];
		saveDraft();
		const request = chat.send({ ...requestFor(text), images: sentImages });
		// The tags left with the prompt, so the chips they stood for go too.
		chat.chips = [];
		handoff = undefined;
		await tick();
		if (followingLatest) viewport?.scrollTo({ top: viewport.scrollHeight });
		await request;
	}

	// --- editing a question that was already asked ---

	let editingId = $state<string | undefined>(undefined);
	let editDraft = $state('');

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

<div class="flex h-full min-h-0 flex-col gap-2">
	{#if !agentAvailable}
		<div class="rounded-md border border-border bg-muted/50 p-3 text-sm" role="status">
			Agent chat is disabled. Configure <code class="font-mono text-xs">OPENROUTER_API_KEY</code> to enable
			it.
		</div>
	{/if}

	<ChatThread
		{shell}
		{sessions}
		{activeNoteId}
		{activeProjectId}
		{showHistory}
		entries={chat.entries}
		isStreaming={chat.isStreaming}
		deciding={chat.deciding}
		{editingId}
		bind:editDraft
		bind:viewport
		{showJumpToLatest}
		onswitchconversation={(id) => void chat.switchToConversation(id)}
		onstarter={useStarter}
		oneditkeydown={handleEditKeydown}
		onresubmit={(entry, text) => void resubmit(entry, text)}
		oncanceledit={cancelEditing}
		onapprove={(entry, tools) => void chat.decideAll(entry, tools, 'approve')}
		onrejectapproval={(entry, tools) => void chat.decideAll(entry, tools, 'reject')}
		onretry={(entry) => void requestRetry(entry)}
		oncopy={(entry) => void copyMessage(entry)}
		onstartediting={startEditing}
		onaskagain={askAgain}
		onsuggestion={(id, decision) => void decide(id, decision)}
		onsuggestionbusy={(id) =>
			(workbench.focusedNoteId &&
				suggestionTrayRegistry.peek(workbench.focusedNoteId)?.busyIds.includes(id)) ??
			false}
		onjumptolatest={jumpToLatest}
	/>
	<ChatComposer
		bind:prompt
		bind:textareaRef
		{autoChip}
		chips={chat.chips}
		{mentionCandidates}
		{highlighted}
		{selectedImages}
		{agentAvailable}
		isStreaming={chat.isStreaming}
		connection={chat.connection}
		executionMode={chat.executionModeOverride}
		onremovechip={(chip, automatic) => {
			if (automatic) chat.autoChipDismissedFor = chip.id;
			else unpick(chip);
		}}
		onpick={pick}
		onhighlight={(index) => (highlighted = index)}
		onremoveimage={(id) => (selectedImages = selectedImages.filter((image) => image.id !== id))}
		onfiles={(files) => void addImages(files)}
		onkeydown={handleKeydown}
		oninput={handleInput}
		onpaste={pasteImages}
		ontoggleexecutionmode={toggleExecutionMode}
		onsend={() => void send()}
		onstop={() => void chat.stop()}
	/>
</div>
