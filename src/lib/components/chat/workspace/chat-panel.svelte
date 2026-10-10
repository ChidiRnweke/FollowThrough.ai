<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace-views';

	import { onMount, tick, untrack } from 'svelte';
	import { z } from 'zod';
	import type { SuggestionId } from '$lib/models/suggestions';
	import type {
		AgentModel,
		AgentPreferenceValues,
		ContextResourceRef,
		ConversationImageInput,
		Conversation
	} from '$lib/models/agent';
	import type { AgentModelDefaults } from '$lib/models/agent/model-label';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';

	import { chatPresentation } from '$lib/factories/agent/presentation';
	import { type ChatEntry } from '$lib/models/chat';
	import type { ChatSessionController } from '$lib/controllers/agent/chat-session';
	import { type ContextChip, type ResourceChip } from '$lib/models/chat';
	import { agentSelectionContext } from '$lib/factories/agent/selection-context';
	import { editorSelectionRegistry } from '$lib/stores/notes/registries/editor-selection-registry.svelte';
	import { suggestionActions } from '$lib/stores/suggestions/actions.svelte';
	import { workbench } from '$lib/factories/workbench/workbench';
	import { toast } from 'svelte-sonner';

	import { chatCanvas } from '$lib/factories/agent/chat-canvas';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { slide } from 'svelte/transition';
	import { PrefersReducedMotion } from '$lib/hooks/prefers-reduced-motion.svelte';
	import { StudioHandoff } from '$lib/components/diagrams';
	import { Button } from '$lib/components/ui/button';
	import ChatComposer from './chat-composer.svelte';
	import ChatThread from './chat-thread.svelte';
	import { agentContext } from '$lib/factories/agent/context';

	import type { ComposerSelection } from '$lib/models/chat';
	import { readMentionInput } from '$lib/client/agent/mention-input';
	import { MENTION_PATTERN } from '$lib/models/chat';
	import { createChatComposer } from '$lib/factories/agent/chat-composer';

	let {
		chat,
		shell,
		sessions,
		activeNoteId,
		openResource,
		activeProjectId,
		initialConversationId,
		showHistory = true,
		agentPreferences,
		agentModels,
		agentDefaults,
		agentAvailable,
		registerComposerFocus
	}: {
		/**
		 * The session this panel shows. Passed in rather than imported: several
		 * conversations run at once, each with its own store, and a module
		 * singleton would make every mounted panel share one transcript.
		 */
		chat: ChatSessionController;
		shell?: ShellContext;
		sessions: readonly Conversation[];
		activeNoteId?: NoteId;
		/**
		 * The widget or diagram open in the focused pane. It travels along the way the open
		 * note does; a file never opens in a pane, so it can only be mentioned.
		 */
		openResource?: Extract<ContextResourceRef, { kind: 'widget' | 'diagram' }>;
		activeProjectId?: ProjectId;
		initialConversationId?: Conversation['id'] | null;
		showHistory?: boolean;
		agentPreferences: AgentPreferenceValues;
		agentModels: readonly AgentModel[];
		/** What a conversation with no model of its own runs on, resolved server-side. */
		agentDefaults: AgentModelDefaults;
		agentAvailable: boolean;
		registerComposerFocus?: (focus: () => void) => () => void;
	} = $props();
	// Svelte's JS transitions run outside `layout.css`'s reduced-motion guard, so
	// the duration is read rather than assumed. `--duration-disclosure` in ms: the
	// offer is a block of content arriving under the transcript, which is exactly
	// what that token is for.
	const reducedMotion = new PrefersReducedMotion();
	const offerMotion = $derived(reducedMotion.current ? { duration: 0 } : { duration: 200 });
	/**
	 * Where this conversation's canvas belongs, and whether it is already there.
	 *
	 * `canvasPlacement` resolves the tab once — the draft tab before a diagram was
	 * kept, the saved diagram's tab after, and the revised diagram's own tab for a
	 * revision. This used to ask two lookups and accept either, which meant a
	 * conversation with a kept diagram counted as "on screen" no matter what the
	 * agent had since drawn, and the offer was withheld for the rest of it.
	 */
	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before opening a chat');
	const resources = session.resources;
	const composer = untrack(() => createChatComposer(chat));
	$effect(() => {
		const online = resources.online;
		untrack(() => {
			if (!online || chat.initialized) void chat.revalidate();
		});
	});

	const canvas = $derived(chatCanvas.canvasFor(chat.sessionKey));
	const canvasOnScreen = $derived(canvas !== undefined && workbench.openTabs.includes(canvas.tab));
	/** Pull journal changes after an agent applies a diagram edit. */
	let refreshedRevisionCallId = $state<string | undefined>(undefined);
	$effect(() => {
		const applied = chatCanvas.latestDiagramWrite(chat.sessionKey);
		if (!applied || applied.callId === refreshedRevisionCallId) return;
		refreshedRevisionCallId = applied.callId;
		void workspaceSession.synchronize();
	});
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
		canvas && !canvasOnScreen ? { diagramId: canvas.diagramId, canvasTab: canvas.tab } : undefined
	);
	$effect(() => chat.persistConversationChoices());
	onMount(() => {
		// No `observe()` here any more: the registry's refcount is the same
		// mechanism, and whoever acquired this store owns detaching it.
		const releaseComposerFocus = registerComposerFocus?.(() => textareaRef?.focus());
		chat.initialize(agentPreferences.executionMode);
		if (initialConversationId === null) {
			chat.clear();
			void chat.hydrate(resources);
		} else if (initialConversationId)
			void openConversation(chat.switchToConversation(initialConversationId, resources));
		else void openConversation(chat.hydrate(resources));
		const restored = composer.restore(shell?.noteTree ?? []);
		prompt = restored.text;
		if (restored.source === 'handoff') focusPrefill();
		return () => releaseComposerFocus?.();
	});

	// An invocation point elsewhere in the app wrote a prompt while this panel was
	// already mounted (the docked case, where `onMount` above has long since run).
	$effect(() => {
		const request = chat.staged;
		if (!request) return;
		prompt = composer.consumeStaged(shell?.noteTree ?? []) ?? prompt;
		focusPrefill();
	});

	/**
	 * Put the sentence in the composer and hand over the caret — deliberately without
	 * sending. Reading the prompt is how the invocation points teach what the agent
	 * can be asked for, and an edit is always one keystroke away.
	 */
	function focusPrefill(): void {
		void tick().then(() => {
			const node = textareaRef;
			if (!node) return;
			node.focus();
			node.setSelectionRange(node.value.length, node.value.length);
		});
	}

	let prompt = $state('');
	let viewport = $state<HTMLElement | null>(null);
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let selectedImages = $state<ConversationImageInput[]>([]);
	const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

	async function addImages(files: readonly File[]): Promise<void> {
		const accepted = files.filter((file) => IMAGE_TYPES.has(file.type));

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
	function saveDraft(): void {
		composer.save(prompt);
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

	// The open note — or the open widget or diagram — travels along automatically, like
	// Copilot's current file.
	const autoChip = $derived.by((): ResourceChip | undefined => {
		const candidate = openResourceChip() ?? openNoteChip();
		if (!candidate || chat.autoChipDismissedFor === composer.key(candidate)) return undefined;
		if (chat.chips.some((chip) => composer.key(chip) === composer.key(candidate))) return undefined;
		return candidate;
	});

	function openNoteChip(): ResourceChip | undefined {
		if (!activeNoteId) return undefined;
		const note = shell?.noteTree.find((entry) => entry.id === activeNoteId);
		return note ? { kind: 'note', id: note.id, name: note.title } : undefined;
	}

	function openResourceChip(): ResourceChip | undefined {
		if (!openResource) return undefined;
		if (openResource.kind === 'widget') {
			const widget = resources.views.widget(openResource.id);
			return widget ? { kind: 'widget', id: widget.id, name: widget.title } : undefined;
		}
		// A studio conversation already works on its canvas; attaching that same diagram again
		// would hand the agent two copies of the drawing it is editing.
		if (canvas?.diagramId === openResource.id) return undefined;
		const diagram = resources.views.diagram(openResource.id);
		return diagram && !diagram.archivedAt
			? { kind: 'diagram', id: diagram.id, name: agentContext.diagramName(diagram) }
			: undefined;
	}

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
		return agentSelectionContext.live(
			selection
				? { kind: 'selected', selection, noteTitle: title ?? 'Untitled note' }
				: { kind: 'none' },
			chat.chips.filter((chip) => chip.kind === 'selection').map((chip) => chip.id),
			chat.dismissedSelectionId
		);
	});

	// --- @ mention picker ---

	const mentionQuery = $derived(agentContext.query(prompt));
	let highlighted = $state(0);

	const mentionCandidates = $derived(
		mentionQuery === undefined || !shell
			? []
			: agentContext.candidates(
					mentionQuery,
					shell.noteTree,
					shell.skills,
					resources.availability,
					resources.views.mentionableResources(mentionQuery, activeProjectId)
				)
	);
	const visibleChips = $derived(
		chat.chips.map((chip) =>
			chip.kind === 'folder' && shell && resources.availability === 'complete'
				? { ...chip, noteCount: agentContext.folderNotes(shell.noteTree, chip.id).length }
				: chip
		)
	);

	$effect(() => {
		void mentionQuery;
		highlighted = 0;
	});

	/** The tag stays in the sentence; the chip is the same choice, shown as a badge. */
	function pick(candidate: ResourceChip): void {
		prompt = composer.pick(prompt, candidate);
		textareaRef?.focus();
	}
	function unpick(chip: ContextChip): void {
		prompt = composer.unpick(chip);
	}

	/**
	 * The text rules: a chip whose tag the user has typed away is no longer attached.
	 * Done on input rather than in an `$effect` so clearing the prompt to send does
	 * not drop the chips out from under the request being built.
	 */
	let beforeInput: ComposerSelection | undefined;
	function captureInput(event: InputEvent): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLTextAreaElement)) throw new Error('Expected the chat textarea');
		beforeInput = { from: target.selectionStart, to: target.selectionEnd };
	}
	function replacePrompt(text: string): void {
		prompt = composer.replace(text);
	}
	function handleInput(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLTextAreaElement)) throw new Error('Expected the chat textarea');
		const inputType = event instanceof InputEvent ? event.inputType : '';
		const change =
			inputType === 'historyUndo'
				? { kind: 'undo' as const }
				: inputType === 'historyRedo'
					? { kind: 'redo' as const }
					: beforeInput
						? readMentionInput(chat.mentionDraft.present.text, target.value, beforeInput, inputType)
						: { kind: 'untracked' as const };
		beforeInput = undefined;
		const result = composer.edit(target.value, change);
		prompt = result.text;
		if (result.mentionsCleared)
			toast.info('Context mentions were cleared by this edit. Add them again before sending.');
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
	function requestContext(text: string) {
		return {
			text,
			images: selectedImages,
			noteTree: shell?.noteTree ?? [],
			availability: shell ? resources.availability : ('unknown' as const),
			autoChip,
			focusedNoteId,
			activeProjectId,
			liveSelectionChip
		};
	}
	function requestFor(text: string) {
		return composer.request(requestContext(text));
	}
	async function send(): Promise<void> {
		const text = prompt.trim();
		if ((!text && !selectedImages.length) || chat.isStreaming) return;
		const result = composer.send(requestContext(text));
		if (result.kind === 'unavailable') {
			toast.error(result.message);
			return;
		}
		prompt = '';
		selectedImages = [];
		await tick();
		pinLatestQuestion();
		await result.completion;
	}

	// --- editing a question that was already asked ---

	let editingId = $state<string | undefined>(undefined);
	let editDraft = $state('');

	function startEditing(entry: ChatEntry): void {
		editingId = entry.id;
		editDraft = chatPresentation.entryText(entry);
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
		const prepared = requestFor(trimmed);
		if (prepared.kind === 'unavailable') {
			toast.error(prepared.message);
			return;
		}
		cancelEditing();
		const started = await chat.resubmit(entry, prepared.request);
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
		void resubmit(question, chatPresentation.entryText(question));
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
		await navigator.clipboard.writeText(chatPresentation.entryText(entry));
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
				const match = MENTION_PATTERN.exec(prompt);
				if (match) {
					prompt = composer.editMention({
						from: match.index + match[1]!.length,
						to: prompt.length,
						text: ''
					});
					prompt = chat.mentionDraft.present.text;
					saveDraft();
				}
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
		const ok = await chat.decideSuggestion(suggestionId, decision, (id, choice) =>
			suggestionActions.decide(id, choice)
		);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
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
		replacePrompt(text);
		saveDraft();
		textareaRef?.focus();
	}

	function toggleExecutionMode(): void {
		chat.chooseExecutionMode(
			chat.executionModeOverride === 'auto_accept' ? 'approval_required' : 'auto_accept'
		);
	}
</script>

<!-- The host supplies the remaining height through flex layout. This surface must
     not become a second scroll container when the transcript or draft changes. -->
<div class="flex min-h-0 flex-1 flex-col overflow-clip">
	{#if !agentAvailable}
		<div class="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm" role="status">
			Agent chat is disabled. Configure <code class="text-xs">OPENROUTER_API_KEY</code> to enable it.
		</div>
	{/if}
	{#if chat.historyError}
		<div role="alert" class="mb-4 text-sm text-destructive">
			{chat.historyError}
			<Button variant="outline" onclick={() => void chat.hydrate(resources)}>Retry</Button>
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
			executionDisabled={!chat.canExecute}
			{editingId}
			bind:editDraft
			bind:viewport
			bind:questionRef
			bind:anchorSpacer
			{showJumpToLatest}
			onswitchconversation={(id) => void openConversation(chat.switchToConversation(id, resources))}
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
			onsuggestionbusy={(id) => suggestionActions.busyIds.includes(id)}
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
				chips={visibleChips}
				{mentionCandidates}
				{highlighted}
				{selectedImages}
				agentAvailable={agentAvailable && chat.canExecute}
				isStreaming={chat.isStreaming}
				connection={resources.online ? chat.connection : 'offline'}
				executionMode={chat.executionModeOverride}
				models={agentModels}
				modelOverride={chat.modelOverride}
				defaultModelId={agentDefaults.chatModelId}
				visionModelOverride={chat.visionModelOverride}
				defaultVisionModelId={agentDefaults.visionModelId}
				onmodelchange={(value) => chat.chooseModel(value)}
				onvisionmodelchange={(value) => chat.chooseVisionModel(value)}
				onremovechip={(chip, automatic) => {
					// Two chips arrive automatic — the open note, widget or diagram, and the live
					// selection — and neither is held in `chat.chips`, so dismissing them is
					// remembering not to offer them again rather than removing anything.
					if (automatic && chip.kind === 'selection') chat.dismissSelection(chip.id);
					else if (automatic) chat.dismissAutoChip(composer.key(chip));
					else unpick(chip);
				}}
				onpinselection={(chip) => chat.addChip(chip)}
				onpick={pick}
				onhighlight={(index) => (highlighted = index)}
				onremoveimage={(id) => (selectedImages = selectedImages.filter((image) => image.id !== id))}
				onfiles={(files) => void addImages(files)}
				onkeydown={handleKeydown}
				oninput={handleInput}
				onbeforeinput={captureInput}
				onpaste={pasteImages}
				ontoggleexecutionmode={toggleExecutionMode}
				onsend={() => void send()}
				onstop={() => void chat.stop()}
			/>
		</div>
	</div>
</div>
