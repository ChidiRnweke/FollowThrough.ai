<script lang="ts">
	import type { Diagram } from '$lib/models/diagrams';
	import type { WriteConflictView } from '$lib/models/outbox';
	import { userFacingMessage } from '$lib/errors';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import DiagramDocumentPreview from './diagram-document-preview.svelte';

	let {
		open = $bindable(false),
		record,
		onUseRemote,
		onKeepLocal
	}: {
		open?: boolean;
		record: WriteConflictView<Diagram>;
		onUseRemote: () => Promise<void>;
		onKeepLocal: () => Promise<void>;
	} = $props();
	let resolving = $state<'remote' | 'local' | undefined>();
	let failure = $state('');

	async function resolve(choice: 'remote' | 'local'): Promise<void> {
		resolving = choice;
		failure = '';
		try {
			if (choice === 'remote') await onUseRemote();
			else await onKeepLocal();
			// audit-allow: silent-catch — the dialog renders the failure as an alert and keeps both documents available for retry.
		} catch (error) {
			failure = userFacingMessage(error, 'The diagram conflict could not be resolved.');
		} finally {
			resolving = undefined;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="dialog-fill flex flex-col sm:max-w-7xl">
		<Dialog.Header>
			<Dialog.Title>This diagram changed somewhere else</Dialog.Title>
			<Dialog.Description>
				Compare the shared base, your changes, and the latest saved version before choosing which
				diagram to keep. Keeping your changes retries the action you originally requested against
				the reviewed version.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid min-h-0 flex-1 gap-6 overflow-auto md:grid-cols-3">
			{#each [{ label: 'Shared base', document: record.base }, { label: 'Your changes', document: record.local }, { label: 'Latest saved version', document: record.remote.kind === 'found' ? record.remote.value : null }] as comparison (comparison.label)}
				<section aria-label={comparison.label} class="flex min-h-0 flex-col gap-3">
					<div class="border-b pb-3">
						<h3 class="text-sm font-medium">{comparison.label}</h3>
						<p class="text-sm text-muted-foreground">
							{comparison.document?.title ?? 'Untitled diagram'}
						</p>
					</div>
					{#if comparison.document}
						<DiagramDocumentPreview
							source={comparison.document.source}
							title={comparison.document.title}
						/>
					{:else}<p>
							{comparison.label === 'Latest saved version' && record.remote.kind === 'deleted'
								? 'This diagram was deleted on the server. Your local changes are retained.'
								: 'No document is available for this version.'}
						</p>{/if}
				</section>
			{/each}
		</div>
		{#if failure}<p role="alert" class="text-sm text-destructive">{failure}</p>{/if}
		<Dialog.Footer>
			<Button variant="outline" disabled={resolving !== undefined} onclick={() => (open = false)}
				>Review later</Button
			>
			<Button
				variant="secondary"
				disabled={resolving !== undefined}
				onclick={() => void resolve('remote')}
			>
				{#if resolving === 'remote'}<Spinner data-icon="inline-start" />{/if}
				Use latest
			</Button>
			<Button
				disabled={resolving !== undefined || record.remote.kind !== 'found'}
				onclick={() => void resolve('local')}
			>
				{#if resolving === 'local'}<Spinner data-icon="inline-start" />{/if}
				Keep mine
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
