<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { z } from 'zod';
	import type { SuggestionId } from '$lib/models/suggestions';
	import type {
		AgentPreferences,
		ConversationImageInput,
		Conversation,
		RunAgentInput
	} from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import type { ShellContext } from '$lib/models/workspace';
	import {
		entryText,
		type ChatEntry,
		type ChatStore,
		type ContextChip,
		type ResourceChip
	} from '$lib/stores/agent/chat.svelte';
	import { liveSelectionChipOf, selectionChipOf } from '$lib/stores/agent/selection-chip';
	import { editorSelectionRegistry } from '$lib/stores/notes/registries/editor-selection-registry.svelte';
	import { suggestionTrayRegistry } from '$lib/stores/notes/registries/suggestion-tray-registry.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { toast } from 'svelte-sonner';
	import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';
	import { invalidateAll } from '$app/navigation';
	import { consumeChatHandoff, type ChatHandoff } from '$lib/stores/agent/chat-handoff';
	import {
		chatRegistry,
		MAX_CONCURRENT_STREAMS
	} from '$lib/stores/agent/registries/chat-registry.svelte';
	import { canvasFor, studioTabFor } from '$lib/stores/diagrams/canvas.svelte';
	import { slide } from 'svelte/transition';
	import { PrefersReducedMotion } from '$lib/hooks/prefers-reduced-motion.svelte';
	import { takeCanvasRender } from '$lib/stores/diagrams/canvas-render.svelte';
	import { StudioHandoff } from '$lib/components/diagrams';
	import { Button } from '$lib/components/ui/button';
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
		chat,
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
		/**
		 * The session this panel shows. Passed in rather than imported: several
		 * conversations run at once, each with its own store, and a module
		 * singleton would make every mounted panel share one transcript.
		 */
		chat: ChatStore;
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
	// Svelte's JS transitions run outside `layout.css`'s reduced-motion guard, so
	// the duration is read rather than assumed. `--duration-disclosure` in ms: the
	// offer is a block of content arriving under the transcript, which is exactly
	// what that token is for.
	const reducedMotion = new PrefersReducedMotion();
	const offerMotion = $derived(reducedMotion.current ? { duration: 0 } : { duration: 200 });
	const canvas = $derived(canvasFor(chat.sessionKey));
	const kept = $derived(studioTabFor(chat.conversationId));
	/**
	 * Whether this conversation's diagram is already on screen somewhere.
	 *
	 * Two tabs can be showing it, and which one depends on history the canvas
	 * cannot see: the draft tab before it was kept, the saved diagram's tab after.
	 * Asking only the first is what left the offer standing beside the studio it
	 * had just opened, for the rest of the conversation.
	 */
	const canvasOnScreen = $derived(
		(canvas !== undefined && workbench.openTabs.includes(canvas.tab)) ||
			(kept.kind === 'kept' && workbench.openTabs.includes(kept.tab))
	);
	/**
	 * The diagram this conversation produced, when this chat has nowhere to show it.
	 *
	 * The canvas is a workbench tab, so the docked panel and the full-page chat
	 * have none — and a diagram is not something to paste into a transcript. The
	 * agent's work becomes an offer to move somewhere that can show it, carrying
	 * this conversation along.
	 */
	const studioOffer = $derived(
		// Offering while the lookup is still out flashes the card onto every mount
		// of an already-kept conversation — which is the whole reason `pending` is
		// an arm of its own rather than an absent tab.
		canvas && kept.kind !== 'pending' && !canvasOnScreen
			? { subject: canvas.subject, canvasTab: canvas.tab }
			: undefined
	);
	$effect(() => chat.persistConversationChoices());
	onMount(() => {
		// No `observe()` here any more: the registry's refcount is the same
		// mechanism, and whoever acquired this store owns detaching it.
		const releaseComposerFocus = registerComposerFocus?.(() => textareaRef?.focus());
		chat.initialize(agentPreferences.executionMode);
		if (initialConversationId === null) chat.clear();
		else if (initialConversationId)
			void openConversation(chat.switchToConversation(initialConversationId));
		else void openConversation(chat.hydrate());
		const staged = consumeChatHandoff();
		if (staged) prefill(staged);
		else prompt = sessionStorage.getItem(draftKey()) ?? '';
		return () => releaseComposerFocus?.();
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
		// A selection arrives as a chip rather than as hidden request state, so the composer
		// shows the passage the question is about before the question is asked. Pinning the
		// same passage twice is a no-op: the chip's id is its range.
		if (request.selection) {
			const title = shell?.noteTree.find((entry) => entry.id === request.selection?.noteId)?.title;
			chat.addChip(selectionChipOf(request.selection, title ?? 'Untitled note'));
		}
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
	let questionRef = $state<HTMLElement | null>(null);
	let anchorSpacer = $state(0);
	/**
	 * `pinned`: the question just asked is held at the top of the port while its answer is
	 * written into the space the thread reserved beneath it — nothing moves, so nothing is
	 * pulled out from under the reader. Once that space is used up there is nowhere left to
	 * write and following the bottom resumes, which is also what `follow` does throughout.
	 */
	let anchorMode = $state<'pinned' | 'follow'>('follow');

	// A finished turn has no more content coming, so it releases the pin. The next send
	// takes it again.
	$effect(() => {
		if (!chat.isStreaming) anchorMode = 'follow';
	});

	/** Put the newest question at the top of the scroll port. */
	function pinLatestQuestion(): void {
		const port = viewport;
		const question = questionRef;
		anchorMode = 'pinned';
		if (!port || !question) return;
		port.scrollTop += question.getBoundingClientRect().top - port.getBoundingClientRect().top;
	}

	/** Open a conversation on its last exchange rather than on the reserved space below it. */
	async function openConversation(loaded: Promise<unknown>): Promise<void> {
		await loaded;
		await tick();
		pinLatestQuestion();
	}
	// Keyed by session, not conversation: the id only arrives once the first
	// message is sent, so a conversation-keyed draft moved out from under the
	// user mid-compose.
	const draftKey = (): string => `followthrough.chat.draft.${chat.sessionKey}`;

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
		// The room reserved under the last turn is not transcript: a reader parked at the
		// top of the newest question has seen everything there is to see, however far the
		// scrollbar says they still are from the end of the range.
		const distanceFromEnd = () =>
			node.scrollHeight - anchorSpacer - node.scrollTop - node.clientHeight;
		// Following never scrolls backwards: with room still reserved, the end of the
		// transcript sits above where the pin put the viewport, and chasing it would drag
		// the question back down the screen.
		const followEnd = () =>
			node.scrollTo({
				top: Math.max(node.scrollTop, node.scrollHeight - anchorSpacer - node.clientHeight)
			});
		const updatePosition = () => {
			followingLatest = distanceFromEnd() < 48;
			showJumpToLatest = !followingLatest && scrollable();
		};
		const observer = new MutationObserver(() => {
			if (followingLatest && (anchorMode === 'follow' || anchorSpacer === 0)) followEnd();
			else showJumpToLatest = !followingLatest && scrollable();
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
		anchorMode = 'follow';
		if (!viewport) return;
		// The end of the transcript, not the end of the scroll range — landing on the
		// reserved blank would look like the answer had gone missing.
		viewport.scrollTo({
			top: viewport.scrollHeight - anchorSpacer - viewport.clientHeight,
			behavior: 'smooth'
		});
	}

	// The open note travels along automatically, like Copilot's current file.
	const autoChip = $derived.by((): ContextChip | undefined => {
		if (!activeNoteId || chat.autoChipDismissedFor === activeNoteId) return undefined;
		if (chat.chips.some((chip) => chip.kind === 'note' && chip.id === activeNoteId))
			return undefined;
		const note = shell?.noteTree.find((entry) => entry.id === activeNoteId);
		return note ? { kind: 'note', id: note.id, name: note.title } : undefined;
	});

	/**
	 * Whose selection counts. The same note the request is grounded in, so the passage the
	 * composer shows and the passage the run receives can never come from different panes.
	 */
	const focusedNoteId = $derived(workbench.interactionFocusedNoteId ?? workbench.focusedNoteId);

	/**
	 * The passage highlighted right now, attached the way Copilot attaches the current
	 * selection: automatically, but out loud. It follows the caret and is dismissible, and
	 * `requestFor` reads this very chip — never the editor — so what the agent gets is what
	 * the composer showed.
	 */
	const liveSelectionChip = $derived.by(() => {
		const selection = focusedNoteId
			? editorSelectionRegistry.peek(focusedNoteId)?.current
			: undefined;
		const title = selection
			? shell?.noteTree.find((entry) => entry.id === selection.noteId)?.title
			: undefined;
		return liveSelectionChipOf(
			selection,
			title ?? 'Untitled note',
			chat.chips.filter((chip) => chip.kind === 'selection').map((chip) => chip.id),
			chat.dismissedSelectionId
		);
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
		// A pinned selection put no token in the sentence, so there is nothing to take back
		// out of it — and its name is a note title the user may well have typed themselves.
		if (chip.kind !== 'selection') prompt = withoutMention(prompt, chip);
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
	 * The context a prompt travels with — open note, project, handoff. Shared by the
	 * composer and by resubmitting an edited question, so an edited turn is grounded
	 * exactly like a freshly typed one.
	 *
	 * Passages travel as chips. The pinned ones `ChatStore.send` maps itself; the one still
	 * following the caret is added here, from the same derivation the composer renders. The
	 * editor's own selection is never read at this point, so what the agent gets is what the
	 * composer showed — including the case where the user dismissed the chip and gets nothing.
	 */
	function requestFor(text: string): Omit<RunAgentInput, 'conversationId'> {
		const folderNotes = shell
			? chat.chips
					.filter((chip): chip is ResourceChip => chip.kind === 'folder')
					.flatMap((chip) => folderNoteIds(shell.noteTree, chip.id))
			: [];
		const contextNoteIds = [
			...new Set([...(autoChip ? [autoChip.id] : []), ...folderNotes])
		] as NoteId[];
		const interactionNoteId = focusedNoteId;
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
			...(liveSelectionChip ? { selections: [liveSelectionChip.selection] } : {}),
			...(handoff?.requestedSkillNames
				? { requestedSkillNames: [...handoff.requestedSkillNames] }
				: {})
		};
	}

	async function send(): Promise<void> {
		const text = prompt.trim();
		if ((!text && !selectedImages.length) || chat.isStreaming) return;
		if (chatRegistry.atStreamLimit()) {
			toast.error(`Only ${MAX_CONCURRENT_STREAMS} chats can run at once. Wait for one to finish.`);
			return;
		}
		// A picture of what the agent last drew travels as context, so its next turn
		// can see its own output instead of reasoning about XML it cannot look at.
		// It goes in its own channel rather than among the attachments: it is not
		// something the user sent, and it must not appear in their message.
		const render = takeCanvasRender(chat.sessionKey, selectedImages, {
			maxImages: 4,
			maxBytes: 10 * 1024 * 1024
		});
		const sentImages = selectedImages;
		prompt = '';
		selectedImages = [];
		saveDraft();
		const request = chat.send({
			...requestFor(text),
			images: sentImages,
			...(render ? { contextImages: [render] } : {})
		});
		// The tags left with the prompt, so the chips they stood for go too.
		chat.chips = [];
		handoff = undefined;
		await tick();
		pinLatestQuestion();
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
		pinLatestQuestion();
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
		const suggestionId = z
			.string()
			.uuid()
			.transform((value) => value as SuggestionId)
			.parse(id);
		const tray = workbench.focusedNoteId
			? suggestionTrayRegistry.peek(workbench.focusedNoteId)
			: undefined;
		// The tray only exists while a note pane is mounted. In the right panel there
		// often is none, and routing through it there rejected every decision — so
		// fall back to the controller, which is what the tray calls anyway.
		const ok = tray
			? await tray.decide(suggestionId, decision)
			: await decideDirectly(suggestionId, decision);
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
			// audit-allow: silent-catch — false is the typed decision outcome consumed by the tool card, which keeps the decision available.
		} catch {
			return false;
		}
	}

	async function requestRetry(entry: ChatEntry): Promise<void> {
		try {
			await chat.retry(entry);
			// audit-allow: silent-catch — retry failure is shown while the failed run remains available for another attempt.
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

<div class="flex h-full min-h-0 flex-col">
	{#if !agentAvailable}
		<div class="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm" role="status">
			Agent chat is disabled. Configure <code class="font-mono text-xs">OPENROUTER_API_KEY</code> to enable
			it.
		</div>
	{/if}
	{#if chat.persistenceError}
		<div
			class="mb-4 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
			role="alert"
		>
			<span>{chat.persistenceError}</span>
			<Button
				variant="link"
				class="h-11 shrink-0 px-2"
				onclick={() => chat.resetCorruptPersistence()}
			>
				Reset saved state
			</Button>
		</div>
	{/if}

	<!--
		One measure for the whole column. `max-w-3xl` never binds in the 384px docked
		panel and centres both the transcript and the composer on a full-width page or
		pane, so the same component reads correctly at either width.
	-->
	<div class="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">
		<ChatThread
			{shell}
			preferences={agentPreferences}
			{sessions}
			{activeNoteId}
			{activeProjectId}
			{showHistory}
			entries={chat.entries}
			loading={chat.loading}
			isStreaming={chat.isStreaming}
			deciding={chat.deciding}
			{editingId}
			bind:editDraft
			bind:viewport
			bind:questionRef
			bind:anchorSpacer
			{showJumpToLatest}
			onswitchconversation={(id) => void openConversation(chat.switchToConversation(id))}
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
		{#if studioOffer}
			<!--
				The card's own top padding is inside the animated element, not a gap
				above it: `slide` animates padding, so the offer and the air over it
				leave as one movement rather than the transcript snapping down 16px
				after the card has gone.
			-->
			<div class="shrink-0 pt-4" transition:slide|local={offerMotion}>
				<StudioHandoff
					sessionKey={chat.sessionKey}
					projectId={activeProjectId}
					canvasTab={studioOffer.canvasTab}
					title={studioOffer.subject.kind === 'draft' ? studioOffer.subject.draft.title : undefined}
				/>
			</div>
		{/if}
		<!-- 24px: the composer is a different kind of thing from the transcript above it,
	     and the gap is what says so. At the old 8px the two read as one cramped stack. -->
		<div class="shrink-0 pt-6">
			<ChatComposer
				bind:prompt
				bind:textareaRef
				{autoChip}
				liveSelection={liveSelectionChip}
				chips={chat.chips}
				{mentionCandidates}
				{highlighted}
				{selectedImages}
				{agentAvailable}
				isStreaming={chat.isStreaming}
				connection={chat.connection}
				executionMode={chat.executionModeOverride}
				onremovechip={(chip, automatic) => {
					// Two chips arrive automatic — the open note and the live selection — and neither
					// is held in `chat.chips`, so dismissing them is remembering not to offer them
					// again rather than removing anything.
					if (automatic && chip.kind === 'note') chat.autoChipDismissedFor = chip.id;
					else if (automatic && chip.kind === 'selection') chat.dismissedSelectionId = chip.id;
					else unpick(chip);
				}}
				onpinselection={(chip) => chat.addChip(chip)}
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
	</div>
</div>
