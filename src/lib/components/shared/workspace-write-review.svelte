<script lang="ts">
	import { dependentWrites, type OutboxEntry } from '$lib/models/outbox';
	import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
	import type { WorkspaceRecord } from '$lib/models/workspace-records';
	import type { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import WorkspaceRecordPreview from './workspace-record-preview.svelte';

	type Entry = OutboxEntry<WorkspaceCommand, WorkspaceRecord>;
	let { resources, open = $bindable(false) }: { resources: WorkspaceResources; open?: boolean } =
		$props();
	let reviewed = $state<readonly Entry[]>([]);
	let busy = $state(false);
	let failure = $state<string | null>(null);
	$effect(() => {
		if (!resources.active) open = false;
		return () => {
			reviewed = [];
			open = false;
		};
	});
	const selected = $derived(reviewed[0]);
	const canDiscard = $derived(
		reviewed.length > 0 &&
			reviewed.every(
				(entry) => entry.delivery.kind !== 'sending' && entry.delivery.kind !== 'retry'
			)
	);
	const title = (entry: Entry): string => {
		const record = entry.intent.local ?? entry.intent.base?.value;
		if (!record) return 'Deleted item';
		if ('title' in record.value && record.value.title) return record.value.title;
		if ('name' in record.value) return record.value.name;
		return record.type.replaceAll('_', ' ');
	};
	function review(entry: Entry): void {
		const group = dependentWrites(resources.pending, entry.intent.operationId);
		reviewed = [
			entry,
			...group.filter((item) => item.intent.operationId !== entry.intent.operationId)
		];
		failure = null;
	}
	async function resolve(choice: 'keep' | 'discard'): Promise<void | { kind: 'failure' }> {
		if (!selected) return;
		busy = true;
		failure = null;
		try {
			if (choice === 'keep') await resources.keepLocal(selected.intent.operationId);
			else await resources.discard(reviewed.map((entry) => entry.intent.operationId));
			reviewed = [];
			void resources.synchronize();
		} catch (error) {
			failure = error instanceof Error ? error.message : 'The local changes could not be resolved';
			return { kind: 'failure' };
		} finally {
			busy = false;
		}
	}
	function download(): void {
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(reviewed, null, 2)], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'followthrough-local-changes.json';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class={selected &&
		['notes', 'diagrams'].includes(
			(selected.intent.local ?? selected.intent.base?.value)?.type ?? ''
		)
			? 'dialog-fill flex flex-col sm:max-w-7xl'
			: 'flex max-h-full flex-col sm:max-w-4xl'}
	>
		<Dialog.Header>
			<Dialog.Title>Changes saved on this device</Dialog.Title>
			<Dialog.Description
				>Review changes that have not reached the server. Your changes stay on this device until you
				resolve them.</Dialog.Description
			>
		</Dialog.Header>
		<div class="min-h-0 flex-1 overflow-auto space-y-6">
			{#if selected}
				<Button variant="ghost" disabled={busy} onclick={() => (reviewed = [])}
					>Back to changes</Button
				>
				<h3 class="text-lg font-medium">{title(selected)}</h3>
				<p class="text-sm capitalize">{selected.intent.command.kind.replace(/([A-Z])/g, ' $1')}</p>
				{#if selected.delivery.kind === 'conflict' && selected.intent.base === null}
					<p>
						This new item conflicts with an existing item. Download your changes and create another
						item to retain both copies.
					</p>
				{:else if selected.delivery.kind === 'conflict'}
					<p>
						The server copy changed. Keeping your change retries the original action against the
						version shown below.
					</p>
				{:else if selected.delivery.kind === 'rejected' || selected.delivery.kind === 'retry'}
					<p role="alert">{selected.delivery.message}</p>
				{/if}
				<div
					class={selected.delivery.kind === 'conflict'
						? 'grid gap-6 md:grid-cols-3'
						: 'grid gap-6 md:grid-cols-2'}
				>
					<WorkspaceRecordPreview
						label="Shared base"
						record={selected.intent.base?.value ?? null}
					/>
					<WorkspaceRecordPreview
						label="Your change"
						record={selected.intent.local}
						absent="Delete this item"
					/>
					{#if selected.delivery.kind === 'conflict'}
						<WorkspaceRecordPreview
							label="Server copy"
							record={selected.delivery.remote.kind === 'found'
								? selected.delivery.remote.snapshot.value
								: null}
							absent={selected.delivery.remote.kind === 'deleted'
								? 'Deleted on the server'
								: 'Server copy unavailable'}
						/>
					{/if}
				</div>
				{#if reviewed.length > 1}
					<h3 class="text-sm font-medium">Dependent changes</h3>
					<p>Discarding also removes these changes. Review them before continuing.</p>
					{#each reviewed.slice(1) as entry (entry.intent.operationId)}
						<WorkspaceRecordPreview label={title(entry)} record={entry.intent.local} />
					{/each}
				{/if}
				{#if !canDiscard}<p>
						Reconnect to confirm the last send before discarding these changes.
					</p>{/if}
				{#if selected.delivery.kind === 'conflict' && selected.delivery.remote.kind !== 'found'}<p>
						Download your changes before discarding them. A deleted item must be recreated
						explicitly.
					</p>{/if}
			{:else}
				{#each resources.pending as entry (entry.intent.operationId)}
					<div class="flex items-center gap-3 border-b py-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium">{title(entry)}</p>
							<p class="text-sm text-muted-foreground">
								{entry.delivery.kind === 'conflict' || entry.delivery.kind === 'rejected'
									? 'Needs review'
									: entry.delivery.kind === 'sending' || entry.delivery.kind === 'retry'
										? 'Awaiting server confirmation'
										: 'Waiting to send'}
							</p>
						</div>
						<Button variant="outline" onclick={() => review(entry)}>Review</Button>
					</div>
				{:else}<p>No changes are waiting to send.</p>{/each}
			{/if}
		</div>
		{#if failure}<p role="alert">{failure}</p>{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
			{#if selected}
				<Button variant="secondary" onclick={download}>Download changes</Button>
				<Button
					variant="destructive"
					disabled={busy || !canDiscard}
					onclick={() => void resolve('discard')}
					>Discard {reviewed.length > 1
						? `${reviewed.length} reviewed changes`
						: 'local change'}</Button
				>
				{#if selected.intent.base !== null && selected.delivery.kind === 'conflict' && selected.delivery.remote.kind === 'found'}<Button
						disabled={busy}
						onclick={() => void resolve('keep')}>Keep my change</Button
					>{/if}
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
