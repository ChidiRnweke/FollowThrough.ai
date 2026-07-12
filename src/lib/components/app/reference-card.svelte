<script lang="ts">
	import type { CreateReferenceInput, ExternalReference } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { referenceTierLabels } from './labels';

	let {
		reference
	}: {
		reference: ExternalReference | CreateReferenceInput;
	} = $props();

	const authoritative = $derived(reference.tier === 'official' || reference.tier === 'standard');
</script>

<Card.Root class="ai-provenance gap-2 py-3">
	<Card.Header class="px-4">
		<Card.Title class="flex items-center gap-2 text-sm font-medium">
			<ExternalLink class="size-3.5 shrink-0 text-muted-foreground" />
			<a href={reference.url} target="_blank" rel="noreferrer" class="hover:underline">
				{reference.title}
			</a>
		</Card.Title>
		<Card.Action>
			<Badge variant={authoritative ? 'secondary' : 'ghost'}>
				{referenceTierLabels[reference.tier]}
			</Badge>
		</Card.Action>
	</Card.Header>
	<Card.Content class="px-4">
		<p class="text-sm text-muted-foreground">{reference.relevanceNote}</p>
	</Card.Content>
</Card.Root>
