<script lang="ts">
	import type { Conversation } from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import type { SuggestionId } from '$lib/models/suggestions';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		FtChevronRight as ChevronRight,
		FtLoader as LoaderCircle,
		FtCopy as Copy,
		FtEdit as Pencil,
		FtRefresh as RotateCcw
	} from '$lib/components/icons';
	import { Tip } from '$lib/components/ui/tooltip';
	import type { ChatEntry } from '$lib/stores/agent/chat.svelte';
	import { entryText } from '$lib/stores/agent/chat.svelte';
	import { SuggestionCard } from '$lib/components/suggestions';
	import {
		AgentContextBar,
		isWriteTool,
		toolDetailLines,
		toolStatusLabel
	} from '$lib/components/agent';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import ChatMarkdown from '../chat-markdown.svelte';
	import ChatReasoning from '../chat-reasoning.svelte';
	import ChatActivity from '../chat-activity.svelte';
	import ChatStarters from '../chat-starters.svelte';
	import ToolApprovalGroup from '../actions/tool-approval-group.svelte';
	import { chatPartGroupKey, groupChatParts } from '../chat-parts';
	import ChatHistoryList from './chat-history-list.svelte';
	import ImageLightbox from '../image-lightbox.svelte';

	let {
		shell,
		sessions,
		activeNoteId,
		activeProjectId,
		showHistory,
		entries,
		isStreaming,
		deciding,
		editingId,
		editDraft = $bindable(''),
		viewport = $bindable<HTMLElement | null>(null),
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
		sessions: readonly Conversation[];
		activeNoteId?: NoteId;
		activeProjectId?: ProjectId;
		showHistory: boolean;
		entries: readonly ChatEntry[];
		isStreaming: boolean;
		deciding: boolean;
		editingId?: string;
		editDraft?: string;
		viewport?: HTMLElement | null;
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

	const focusAtEnd = (node: HTMLTextAreaElement): void => {
		node.focus();
		node.setSelectionRange(node.value.length, node.value.length);
	};
</script>

<div class={entries.length === 0 ? 'pb-8' : ''}>
	<AgentContextBar {shell} {activeProjectId} {activeNoteId} compact={entries.length > 0} />
</div>
<ScrollArea class="min-h-0 flex-1 pr-2 " bind:viewportRef={viewport}>
	<div class="flex min-h-full flex-col gap-3">
		{#if entries.length === 0}
			<ChatStarters
				hasNote={activeNoteId !== undefined}
				hasProject={activeProjectId !== undefined}
				onpick={onstarter}
			/>
			{#if showHistory && sessions.length > 0}
				<div class="pt-14">
					<ChatHistoryList
						{sessions}
						{shell}
						limit={3}
						density="compact"
						onselect={onswitchconversation}
					/>
				</div>
			{/if}
		{/if}
		{#each entries as entry (entry.id)}
			<ErrorBoundary label="this turn" class="my-0">
				<div class="group/turn flex flex-col gap-1.5">
					<p class="provenance-caption">{entry.role === 'user' ? 'You' : 'Agent'}</p>
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
								<Button size="xs" onclick={() => onresubmit(entry, editDraft)}>Resubmit</Button>
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
								busy={deciding}
								onapprove={() => onapprove(entry, group.tools)}
								onreject={() => onrejectapproval(entry, group.tools)}
							/>
						{:else}
							{@const part = group.part}
							{#if part.kind === 'text'}
								{#if part.text && editingId !== entry.id}<ChatMarkdown content={part.text} />{/if}
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
							{:else}
								{@const tool = part.tool}
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
												{#if tool.status === 'running'}<LoaderCircle
														class="size-3.5 animate-spin"
													/>{/if}
												{toolStatusLabel(tool, shell)}
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
								<Button variant="outline" size="xs" onclick={() => onretry(entry)}>
									<RotateCcw data-icon="inline-start" /> Retry
								</Button>
							{/if}
						</div>
					{/if}
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
					{#each entry.suggestions as view (view.suggestion.id)}
						<SuggestionCard
							{view}
							busy={onsuggestionbusy(view.suggestion.id)}
							onaccept={(id) => onsuggestion(id, 'accept')}
							onreject={(id) => onsuggestion(id, 'reject')}
						/>
					{/each}
				</div>
			</ErrorBoundary>
		{/each}
	</div>
</ScrollArea>
{#if showJumpToLatest}
	<Button variant="outline" size="sm" class="self-end" onclick={onjumptolatest}
		>Jump to latest</Button
	>
{/if}
