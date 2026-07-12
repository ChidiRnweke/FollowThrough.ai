<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { chat } from '$lib/stores/chat.svelte';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import { toast } from 'svelte-sonner';
	import SuggestionCard from '../suggestion-card.svelte';

	let prompt = $state('');
	let viewport = $state<HTMLElement | null>(null);

	async function send(): Promise<void> {
		const text = prompt.trim();
		if (!text || chat.isStreaming) return;
		prompt = '';
		const selection = editorSelection.current;
		const request = chat.send({
			prompt: text,
			...(selection !== undefined ? { selection, noteId: selection.noteId } : {})
		});
		await tick();
		viewport?.scrollTo({ top: viewport.scrollHeight });
		await request;
	}

	function handleKeydown(event: KeyboardEvent): void {
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

<div class="flex h-full min-h-0 flex-col gap-2">
	<ScrollArea class="min-h-0 flex-1 pr-2" bind:viewportRef={viewport}>
		<div class="flex flex-col gap-3">
			{#if chat.entries.length === 0}
				<p class="text-sm text-muted-foreground">
					Ask about your projects, notes and todos. The current selection travels along as context.
				</p>
			{/if}
			{#each chat.entries as entry (entry.id)}
				<div class="space-y-1.5">
					<p class="provenance-caption">{entry.role === 'user' ? 'You' : 'Agent'}</p>
					{#if entry.text}
						<p class="text-sm whitespace-pre-wrap">{entry.text}</p>
					{/if}
					{#each entry.tools as tool, index (index)}
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
										{tool.name}
									</Button>
								{/snippet}
							</Collapsible.Trigger>
							<Collapsible.Content>
								<p class="pl-6 text-xs text-muted-foreground">
									Tool {tool.name} · {tool.status === 'running' ? 'running' : 'completed'}
								</p>
							</Collapsible.Content>
						</Collapsible.Root>
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
	<div class="flex items-end gap-2">
		<Textarea
			bind:value={prompt}
			placeholder="Ask the agent…"
			rows={2}
			class="min-h-16 resize-none"
			onkeydown={handleKeydown}
			disabled={chat.isStreaming}
		/>
		<Button
			size="icon"
			aria-label="Send message"
			onclick={() => void send()}
			disabled={chat.isStreaming || prompt.trim() === ''}
		>
			{#if chat.isStreaming}
				<LoaderCircle class="size-4 animate-spin" />
			{:else}
				<SendHorizontal class="size-4" />
			{/if}
		</Button>
	</div>
</div>
