<script lang="ts">
	import type { AgentPreferences, Conversation } from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import type { SuggestionId } from '$lib/models/suggestions';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		FtCopy as Copy,
		FtEdit as Pencil,
		FtRefresh as RotateCcw,
		FtWarning as Warning
	} from '$lib/components/icons';
	import { Tip } from '$lib/components/ui/tooltip';
	import type { ChatEntry } from '$lib/stores/agent/chat.svelte';
	import { entryText, entryTools } from '$lib/stores/agent/chat.svelte';
	import { SuggestionCard } from '$lib/components/suggestions';
	import { AgentContextBar } from '$lib/components/agent';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import ChatMarkdown from '../chat-markdown.svelte';
	import ChatReasoning from '../chat-reasoning.svelte';
	import ChatActivity from '../chat-activity.svelte';
	import ChatStarters from '../chat-starters.svelte';
	import ToolApprovalGroup from '../actions/tool-approval-group.svelte';
	import TurnActivity from '../actions/turn-activity.svelte';
	import { chatPartGroupKey, groupChatParts } from '../chat-parts';
	import ChatHistoryList from './chat-history-list.svelte';
	import ChatThreadSkeleton from './chat-thread-skeleton.svelte';
	import ImageLightbox from '../image-lightbox.svelte';
	import { anchorSpacerHeight } from './thread-anchor';

	let {
		shell,
		preferences,
		sessions,
		activeNoteId,
		activeProjectId,
		showHistory,
		entries,
		loading,
		isStreaming,
		deciding,
		editingId,
		editDraft = $bindable(''),
		viewport = $bindable<HTMLElement | null>(null),
		questionRef = $bindable<HTMLElement | null>(null),
		anchorSpacer = $bindable(0),
		showJumpToLatest,
		onswitchconversation,
		onstarter,
		oneditkeydown,
		onresubmit,
		oncanceledit,
		onapprove,
		onrejectapproval,
		onretry,
		oncopy,
		onstartediting,
		onaskagain,
		onsuggestion,
		onsuggestionbusy,
		onjumptolatest
	}: {
		shell?: ShellContext;
		/** The settings in force, so an approval that changes them can show what they were. */
		preferences?: AgentPreferences;
		sessions: readonly Conversation[];
		activeNoteId?: NoteId;
		activeProjectId?: ProjectId;
		showHistory: boolean;
		entries: readonly ChatEntry[];
		loading: boolean;
		isStreaming: boolean;
		deciding: boolean;
		editingId?: string;
		editDraft?: string;
		viewport?: HTMLElement | null;
		/** The newest question's element, so the panel can scroll it to the top of the port. */
		questionRef?: HTMLElement | null;
		/** Height of the reserved space under the last turn; the panel measures scrolling against it. */
		anchorSpacer?: number;
		showJumpToLatest: boolean;
		onswitchconversation: (id: Conversation['id']) => void;
		onstarter: (text: string) => void;
		oneditkeydown: (event: KeyboardEvent, entry: ChatEntry) => void;
		onresubmit: (entry: ChatEntry, text: string) => void;
		oncanceledit: () => void;
		onapprove: (
			entry: ChatEntry,
			tools: Extract<ReturnType<typeof groupChatParts>[number], { kind: 'approvals' }>['tools']
		) => void;
		onrejectapproval: (
			entry: ChatEntry,
			tools: Extract<ReturnType<typeof groupChatParts>[number], { kind: 'approvals' }>['tools']
		) => void;
		onretry: (entry: ChatEntry) => void;
		oncopy: (entry: ChatEntry) => void;
		onstartediting: (entry: ChatEntry) => void;
		onaskagain: (entry: ChatEntry) => void;
		onsuggestion: (id: SuggestionId, decision: 'accept' | 'reject') => void;
		onsuggestionbusy: (id: SuggestionId) => boolean;
		onjumptolatest: () => void;
	} = $props();

	/**
	 * Which activity group carries the turn's log. One door per turn, hung off the last group
	 * so it sits at the end of the work rather than repeating down it.
	 */
	const lastActivityIndex = (entry: ChatEntry): number =>
		groupChatParts(entry.parts).findLastIndex((group) => group.kind === 'activity');

	const focusAtEnd = (node: HTMLTextAreaElement): void => {
		node.focus();
		node.setSelectionRange(node.value.length, node.value.length);
	};

	// --- keeping the newest question at the top of the port ---

	let stack = $state<HTMLElement | null>(null);
	const latestQuestionId = $derived(entries.findLast((entry) => entry.role === 'user')?.id);

	/**
	 * Only the newest question is worth a reference, and it moves as the thread grows, so
	 * the turn hands itself over through an attachment rather than a `bind:this` that
	 * would have to be written on every row and guarded on every read.
	 */
	const markLatestQuestion = (node: HTMLElement): (() => void) => {
		questionRef = node;
		return () => {
			if (questionRef === node) questionRef = null;
		};
	};
	const ignore = (_node: HTMLElement): void => {};

	// The stack grows on every streamed token and the port changes with the window, the
	// docked panel's width, and the composer's own height — so both are watched rather
	// than measured once per turn.
	$effect(() => {
		const port = viewport;
		const content = stack;
		if (!port || !content) return;
		const measure = (): void => {
			const question = questionRef;
			anchorSpacer = question
				? anchorSpacerHeight({
						viewportHeight: port.clientHeight,
						stackHeight: content.offsetHeight,
						questionOffset: question.offsetTop - content.offsetTop
					})
				: 0;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(port);
		observer.observe(content);
		return () => observer.disconnect();
	});
</script>

<!--
	The thread owns the spacing ladder DESIGN_SYSTEM asks for: 4px binds a turn's
	caption to the turn, 8px separates the parts within it, and 24px separates one
	turn from the next. The old flat `gap-3`/`gap-1.5` pair said nothing about which
	gaps meant "same thing" and which meant "next thing".

	The reading measure is the panel's, not the thread's: `chat-panel.svelte` centres
	the whole column so the transcript and the composer share one width. Capping the
	thread alone left the composer spanning a wide pane under a narrow transcript.
-->
<div class="relative flex min-h-0 flex-1 flex-col">
	{#if entries.length > 0}
		<div class="shrink-0 pb-4">
			<AgentContextBar {shell} {activeProjectId} {activeNoteId} compact />
		</div>
	{/if}
	<ScrollArea class="min-h-0 flex-1" bind:viewportRef={viewport}>
		<!-- The gutter is the scrollbar's: it overlays the viewport's right edge
		     rather than reserving space, so a full-width approval or suggestion card
		     underneath it loses its hairline to the track. -->
		<div class="flex min-h-full flex-col gap-6 pr-3">
			{#if entries.length === 0}
				{#if loading}
					<ChatThreadSkeleton />
				{:else}
					<!-- The empty state is the "new chat" surface, so it arrives the way
					     search results do: a 1px rise and fade at the disclosure budget. It
					     only plays on a fresh session — a loaded conversation goes through
					     the skeleton above instead, so it never flashes under a thread. -->
					<div
						class="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-(--ease-standard) flex flex-col gap-6"
					>
						<AgentContextBar {shell} {activeProjectId} {activeNoteId} />
						<ChatStarters
							hasNote={activeNoteId !== undefined}
							hasProject={activeProjectId !== undefined}
							onpick={onstarter}
						/>
						{#if showHistory && sessions.length > 0}
							<div class="pt-8">
								<ChatHistoryList
									{sessions}
									{shell}
									limit={3}
									density="compact"
									onselect={onswitchconversation}
								/>
							</div>
						{/if}
					</div>
				{/if}
			{/if}
			<!--
				The thread reads downward: a question stays where it was asked and its answer is
				written underneath it. The stack used to be bottom-anchored with `mt-auto`, which
				closed the gap over the composer but at the cost of shoving the question you just
				asked upward, one streamed line at a time, while you were still reading it.

				The gap is closed from below instead — see `thread-anchor.ts` for the filler that
				lets the newest question climb to the top of the port. The empty state keeps the
				top and gets no filler: it teaches, and belongs where reading starts.
			-->
			<div bind:this={stack} class="flex flex-col gap-6">
				{#each entries as entry (entry.id)}
					{@const isUser = entry.role === 'user'}
					<ErrorBoundary label="this turn" class="my-0">
						<div
							class="group/turn flex flex-col"
							{@attach entry.id === latestQuestionId ? markLatestQuestion : ignore}
						>
							<!--
							The question is a surface and the answer is the page. Side carries that
							now: the question sits right against a wash, the answer runs flush left
							with no bubble, which would put a second surface inside a panel that
							already is one. Flat, per the ornament rule — no border, no shadow.

							The wash is the brand teal rather than `bg-muted`, which is the fill of
							every disabled notice and hover row in the app and said nothing about
							whose turn this was. Same recipe as the `brand` badge — no new token.

							The captions that used to say it are gone, and a screen reader is told
							none of this — position and fill are not announced — so the turn states
							its speaker for one.
						-->
							<span class="sr-only">{isUser ? 'You said' : 'The agent replied'}</span>
							<div
								class="flex flex-col gap-2 {isUser
									? 'max-w-(--chat-turn-measure) self-end rounded-xl bg-brand/10 px-3 py-2 dark:bg-brand/15'
									: ''}"
							>
								{#if editingId === entry.id}
									<div class="flex flex-col gap-1.5">
										<Textarea
											bind:value={editDraft}
											rows={2}
											class="min-h-16 resize-none"
											aria-label="Edit question"
											onkeydown={(event) => oneditkeydown(event, entry)}
											{@attach focusAtEnd}
										/>
										<div class="flex items-center gap-1.5">
											<Button size="xs" onclick={() => onresubmit(entry, editDraft)}
												>Resubmit</Button
											>
											<Button variant="ghost" size="xs" onclick={oncanceledit}>Cancel</Button>
											<span class="text-xs text-muted-foreground"
												>Replaces everything below this question.</span
											>
										</div>
									</div>
								{/if}
								{#each groupChatParts(entry.parts) as group, index (`${entry.id}-${chatPartGroupKey(group, index)}`)}
									{#if group.kind === 'approvals'}
										<ToolApprovalGroup
											tools={group.tools}
											{shell}
											{preferences}
											busy={deciding}
											onapprove={() => onapprove(entry, group.tools)}
											onreject={() => onrejectapproval(entry, group.tools)}
										/>
									{:else if group.kind === 'activity'}
										<!-- The log is the turn's, so it hangs off the last group and opens onto
									     every call, not just that group's. -->
										<TurnActivity
											tools={group.tools}
											turnTools={entryTools(entry)}
											showLog={index === lastActivityIndex(entry)}
											{shell}
											retryable={entry.status === 'failed' && entry.retryable && !!entry.runId}
											onretry={() => onretry(entry)}
										/>
									{:else}
										{@const part = group.part}
										{#if part.kind === 'text'}
											{#if part.text && editingId !== entry.id}<ChatMarkdown
													content={part.text}
												/>{/if}
										{:else if part.kind === 'image'}
											<ImageLightbox
												src={part.dataUrl}
												alt={part.name}
												class="max-h-48 max-w-64 rounded-md object-contain"
											/>
										{:else if part.kind === 'reasoning'}
											{#if part.text}<ChatReasoning
													text={part.text}
													streaming={entry.status === 'streaming'}
												/>{/if}
										{:else if part.kind === 'unreadable'}
											<!-- A journalled row the transcript reader could not reconstruct. Shown
										     rather than dropped, because the work was attempted and hiding the row
										     reports a turn that did less than it did. Muted rather than an alert:
										     nothing failed for the user, the record of it is what is damaged. -->
											<div class="flex items-start gap-2 text-xs">
												<Warning class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
												<span class="text-muted-foreground">{part.reason}</span>
											</div>
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
									<!-- The run itself ended badly, as opposed to one call inside it: same
								     shape, stated for the turn. -->
									<div class="flex items-start gap-2 text-xs" role="alert">
										<Warning class="mt-0.5 size-3.5 shrink-0 text-destructive" />
										<span class="text-destructive"
											>{entry.error ??
												(entry.status === 'cancelled'
													? 'Generation stopped'
													: 'The run failed.')}</span
										>
										{#if entry.status === 'failed' && entry.retryable && entry.runId}
											<Button variant="outline" size="xs" onclick={() => onretry(entry)}>
												<RotateCcw data-icon="inline-start" /> Retry
											</Button>
										{/if}
									</div>
								{/if}
							</div>
							{#if editingId !== entry.id && entryText(entry)}
								<!-- The actions belong to the turn, so they sit on the turn's own side. -->
								<div
									class="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-(--duration-micro) group-hover/turn:opacity-100 focus-within:opacity-100 {isUser
										? 'self-end'
										: ''}"
								>
									<Tip text="Copy">
										{#snippet children({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon-xs"
												aria-label="Copy message"
												onclick={() => oncopy(entry)}><Copy /></Button
											>
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
													disabled={isStreaming}
													onclick={() => onstartediting(entry)}><Pencil /></Button
												>
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
													disabled={isStreaming}
													onclick={() => onaskagain(entry)}><RotateCcw /></Button
												>
											{/snippet}
										</Tip>
									{/if}
								</div>
							{/if}
							{#if entry.suggestions.length > 0}
								<div class="mt-2 flex flex-col gap-2">
									{#each entry.suggestions as view (view.suggestion.id)}
										<SuggestionCard
											{view}
											busy={onsuggestionbusy(view.suggestion.id)}
											onaccept={(id) => onsuggestion(id, 'accept')}
											onreject={(id) => onsuggestion(id, 'reject')}
										/>
									{/each}
								</div>
							{/if}
						</div>
					</ErrorBoundary>
				{/each}
			</div>
			{#if entries.length > 0}
				<!-- Reserved room, not content: it is what the newest question is scrolled up
				     into, and what the answer then fills. `-mt-6` cancels the column gap so the
				     reserved height is exactly the height that was measured. -->
				<div class="-mt-6 shrink-0" aria-hidden="true" style:height="{anchorSpacer}px"></div>
			{/if}
		</div>
	</ScrollArea>
	<!-- An overlay, not a flow element: as a sibling in the column it pushed the
	     composer down the moment it appeared, which moved the send button out from
	     under the pointer. -->
	{#if showJumpToLatest}
		<div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
			<Button
				variant="outline"
				size="sm"
				class="pointer-events-auto bg-background"
				onclick={onjumptolatest}>Jump to latest</Button
			>
		</div>
	{/if}
</div>
