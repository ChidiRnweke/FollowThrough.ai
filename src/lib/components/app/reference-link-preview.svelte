<script lang="ts">
	import type { SuggestionId } from '$lib/models';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import { referenceTierLabels } from './labels';
	import type { ResolvedReferenceLinkGroup } from './reference-link-plugin';

	let {
		group,
		anchor,
		onretain,
		onurlchange,
		onclose
	}: {
		group: ResolvedReferenceLinkGroup;
		anchor: HTMLAnchorElement;
		onretain: () => void;
		onurlchange: (url: string) => void;
		onclose: () => void;
	} = $props();

	let open = $state(true);

	function remainsInReferenceUi(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;
		if (target.closest('[data-reference-preview]')) return true;
		return Boolean(target.closest<HTMLAnchorElement>('a[href]'));
	}

	function leave(event: PointerEvent | FocusEvent): void {
		if (!remainsInReferenceUi(event.relatedTarget)) onclose();
	}

	function showDestination(target: EventTarget | null): void {
		if (!(target instanceof Element)) return;
		onurlchange(target.closest<HTMLAnchorElement>('a[href]')?.href ?? group.sources[0]?.url ?? '');
	}

	async function decide(suggestionId: SuggestionId, decision: 'accept' | 'reject'): Promise<void> {
		const ok = await suggestionTray.decide(suggestionId, decision);
		if (!ok) {
			toast.error('Could not apply the decision. Try again.');
			return;
		}
		onclose();
	}
</script>

<HoverCard.Root
	bind:open
	openDelay={0}
	closeDelay={250}
	onOpenChange={(nextOpen) => {
		if (!nextOpen) onclose();
	}}
>
	<HoverCard.Content
		customAnchor={anchor}
		sideOffset={6}
		class="flex w-80 flex-col gap-3 rounded-md p-3 shadow-none"
		data-reference-preview
		onpointerenter={(event) => {
			onretain();
			showDestination(event.target);
		}}
		onpointerover={(event) => showDestination(event.target)}
		onpointerout={(event) => showDestination(event.relatedTarget)}
		onpointerleave={leave}
		onfocusin={onretain}
		onfocusout={leave}
	>
		{#each group.sources as source, index (source.id)}
			{#if index > 0}<Separator />{/if}
			<div class="flex flex-col gap-2">
				<div class="flex items-start justify-between gap-2">
					<p class="min-w-0 text-sm font-medium">{source.title}</p>
					{#if source.state !== 'authored'}
						<Badge variant="ghost">{referenceTierLabels[source.tier]}</Badge>
					{/if}
				</div>
				<a
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
					class="break-all font-mono text-xs text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
				>
					{source.url}
				</a>
				{#if source.state === 'pending'}
					<div class="flex items-center gap-2">
						<Button
							size="sm"
							class="min-h-11"
							disabled={suggestionTray.busyIds.includes(source.id)}
							onclick={() => void decide(source.id, 'accept')}
						>
							Accept
						</Button>
						<Button
							size="sm"
							variant="ghost"
							class="min-h-11"
							disabled={suggestionTray.busyIds.includes(source.id)}
							onclick={() => void decide(source.id, 'reject')}
						>
							Dismiss
						</Button>
					</div>
				{/if}
			</div>
		{/each}
	</HoverCard.Content>
</HoverCard.Root>
