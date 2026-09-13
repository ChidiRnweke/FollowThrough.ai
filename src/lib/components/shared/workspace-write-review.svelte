<script lang="ts">
	import { dependentWrites, type OutboxEntry } from '$lib/models/outbox';
	import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
	import type { WorkspaceRecord } from '$lib/models/workspace-records';
	import type { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import WorkspaceRecordPreview from './workspace-record-preview.svelte';
	import EmptyState from './empty-state.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as Alert from '$lib/components/ui/alert';
	import {
		FtCheck,
		FtChevronLeft,
		FtChevronDown,
		FtDocument,
		FtDownload,
		FtFolder,
		FtTodos,
		FtMemory,
		FtSettings,
		FtChat,
		FtWorkflow,
		FtSkills
	} from '$lib/components/icons';
	import {
		writeAction,
		writeTitle as title,
		writeGroup,
		writeExplanation
	} from '$lib/models/workspace-write-review';
	import type { StorageRecoveryItem } from '$lib/models/sync';

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
				(entry) =>
					entry.delivery.kind !== 'sending' && (entry.delivery.kind !== 'retry' || resources.online)
			)
	);
	const groups = [
		{ kind: 'decision', label: 'Needs your decision' },
		{ kind: 'waiting', label: 'Waiting to send' },
		{ kind: 'sending', label: 'Sending' }
	] as const;
	$effect(() => {
		if (open)
			void resources.loadRecovery().catch((error) => {
				failure = error instanceof Error ? error.message : 'Recovery data could not be read';
				return { kind: 'failure' };
			});
	});
	async function downloadRecovery(item: StorageRecoveryItem): Promise<void | { kind: 'failure' }> {
		try {
			downloadBlob(await resources.downloadRecovery(item), 'followthrough-recovery.json');
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Recovery export failed';
			return { kind: 'failure' };
		}
	}
	function downloadBlob(blob: Blob, name: string): void {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
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
	async function refreshConflict(): Promise<void | { kind: 'failure' }> {
		if (!selected) return;
		busy = true;
		failure = null;
		try {
			const operationId = selected.intent.operationId;
			await resources.refreshConflict(operationId);
			const updated = resources.pending.find((entry) => entry.intent.operationId === operationId);
			if (updated) review(updated);
			else reviewed = [];
		} catch (error) {
			failure = error instanceof Error ? error.message : 'The server version could not be read';
			return { kind: 'failure' };
		} finally {
			busy = false;
		}
	}

	function download(): void {
		downloadBlob(
			new Blob([JSON.stringify(reviewed, null, 2)], { type: 'application/json' }),
			'followthrough-local-changes.json'
		);
	}
</script>

<Tooltip.Provider delayDuration={0}>
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
				{#if selected}
					<Button
						variant="link"
						class="h-auto justify-start self-start p-0 text-muted-foreground"
						onclick={() => (reviewed = [])}><FtChevronLeft />Changes</Button
					>
				{/if}
				<Dialog.Title>{selected ? title(selected) : 'Changes saved on this device'}</Dialog.Title>
				<Dialog.Description
					>{selected
						? writeAction[selected.intent.command.kind]
						: 'Review pending changes and choose what to keep.'}</Dialog.Description
				>
			</Dialog.Header>
			<div class="min-h-0 flex-1 flex flex-col gap-6 overflow-auto">
				{#if selected}
					<Alert.Root
						variant={selected.delivery.kind === 'rejected' ? 'destructive' : 'default'}
						role={selected.delivery.kind === 'rejected' ? 'alert' : 'status'}
						><Alert.Description>{writeExplanation(selected, resources.online)}</Alert.Description
						></Alert.Root
					>
					<div
						class={selected.delivery.kind === 'conflict'
							? 'grid gap-6 md:grid-cols-2'
							: 'flex flex-col gap-4'}
					>
						<WorkspaceRecordPreview
							label={selected.delivery.kind === 'conflict' ? 'Your version' : 'Your change'}
							record={selected.intent.local}
							baseline={selected.intent.base?.value ?? null}
							absent="Delete this item"
						/>
						{#if selected.delivery.kind === 'conflict'}
							<WorkspaceRecordPreview
								label="Current on server"
								record={selected.delivery.remote.kind === 'found'
									? selected.delivery.remote.snapshot.value
									: null}
								baseline={selected.intent.base?.value ?? null}
								absent={selected.delivery.remote.kind === 'deleted'
									? 'Deleted on the server'
									: 'Server copy unavailable'}
							/>
						{/if}
					</div>
					{#if selected.delivery.kind === 'conflict'}
						<Button
							variant="outline"
							class="self-start"
							disabled={busy || !resources.online}
							onclick={() => void refreshConflict()}>Check current server version</Button
						>
					{/if}
					{#if selected.intent.base}
						<Collapsible.Root>
							<Collapsible.Trigger class="flex items-center gap-2 text-sm text-muted-foreground"
								><FtChevronDown class="size-4" />Original version</Collapsible.Trigger
							>
							<Collapsible.Content class="pt-4"
								><WorkspaceRecordPreview
									label="Original"
									record={selected.intent.base.value}
								/></Collapsible.Content
							>
						</Collapsible.Root>
					{/if}
					{#if reviewed.length > 1}
						<Collapsible.Root>
							<Collapsible.Trigger class="flex items-center gap-2 text-sm"
								><FtChevronDown class="size-4" />Also affected ({reviewed.length -
									1})</Collapsible.Trigger
							>
							<Collapsible.Content class="flex flex-col gap-4 pt-4">
								<p class="text-sm text-muted-foreground">
									Discarding also removes these dependent changes.
								</p>
								{#each reviewed.slice(1) as entry (entry.intent.operationId)}<WorkspaceRecordPreview
										label={title(entry)}
										record={entry.intent.local}
									/>{/each}
							</Collapsible.Content>
						</Collapsible.Root>
					{/if}
				{:else}
					{#each groups as group (group.kind)}
						{@const entries = resources.pending.filter((entry) => writeGroup(entry) === group.kind)}
						{#if entries.length}
							<section class="flex flex-col gap-2" aria-label={group.label}>
								<h3 class="text-xs font-medium text-muted-foreground">
									{group.label} · {entries.length}
								</h3>
								{#each entries as entry (entry.intent.operationId)}
									<Button
										variant="ghost"
										class="h-auto w-full justify-start gap-3 rounded-lg py-3 text-left whitespace-normal"
										onclick={() => review(entry)}
										aria-label={`Review ${title(entry)}`}
									>
										{@const type = (entry.intent.local ?? entry.intent.base?.value)?.type}
										{@const Icon =
											type === 'projects'
												? FtFolder
												: type === 'todos'
													? FtTodos
													: type === 'memory_entries'
														? FtMemory
														: type === 'conversations'
															? FtChat
															: type === 'diagrams'
																? FtWorkflow
																: type === 'skills'
																	? FtSkills
																	: type === 'notes'
																		? FtDocument
																		: FtSettings}
										<Icon class="size-5 text-muted-foreground" />
										<span class="min-w-0 flex-1"
											><span class="block font-medium">{title(entry)}</span><span
												class="block text-sm font-normal text-muted-foreground"
												>{writeAction[entry.intent.command.kind]} · {entry.delivery.kind ===
												'queued'
													? 'saved on this device'
													: group.label.toLowerCase()}</span
											></span
										>
									</Button>
								{/each}
							</section>
						{/if}
					{/each}
					{#each resources.recoveryItems as item (`${item.source}:${item.key}`)}
						<div class="flex flex-col gap-2 rounded-lg border p-4">
							<p class="text-sm">{item.message}</p>
							<Button variant="link" class="px-0" onclick={() => void downloadRecovery(item)}
								>Download recovery copy</Button
							>
						</div>
					{/each}
					{#if !resources.pending.length && !resources.recoveryItems.length}<EmptyState
							icon={FtCheck}
							title="Everything is saved"
							hint="There are no changes waiting for your decision."
							size="large"
						/>{/if}
				{/if}
			</div>
			{#if failure}<p role="alert" class="text-sm text-destructive">{failure}</p>{/if}
			{#if selected}
				<Dialog.Footer class="gap-3 sm:justify-between">
					<Button variant="link" class="justify-start px-0 text-muted-foreground" onclick={download}
						><FtDownload />Download a copy</Button
					>
					<div class="flex flex-wrap items-center justify-end gap-2">
						<Tooltip.Root>
							<Tooltip.Trigger
								>{#snippet child({ props })}<Button
										{...props}
										variant="outline"
										class="border-destructive/30 text-destructive aria-disabled:opacity-50"
										aria-disabled={busy || !canDiscard}
										onclick={() => {
											if (!busy && canDiscard) void resolve('discard');
										}}>Discard change</Button
									>{/snippet}</Tooltip.Trigger
							>
							<Tooltip.Content
								>{busy
									? 'Wait for the current decision to finish.'
									: !canDiscard
										? 'Reconnect to confirm the last send before discarding.'
										: 'Discard this change and its reviewed dependents.'}</Tooltip.Content
							>
						</Tooltip.Root>
						{#if selected.intent.base !== null && selected.delivery.kind === 'conflict' && selected.delivery.remote.kind === 'found'}
							<Tooltip.Root
								><Tooltip.Trigger
									>{#snippet child({ props })}<Button
											{...props}
											class="aria-disabled:opacity-50"
											aria-disabled={busy}
											onclick={() => {
												if (!busy) void resolve('keep');
											}}>Keep my version</Button
										>{/snippet}</Tooltip.Trigger
								><Tooltip.Content
									>{busy
										? 'Wait for the current decision to finish.'
										: 'Keep your version against the server version shown here.'}</Tooltip.Content
								></Tooltip.Root
							>
						{:else if selected.delivery.kind === 'queued' || selected.delivery.kind === 'retry'}
							<Tooltip.Root
								><Tooltip.Trigger
									>{#snippet child({ props })}<Button
											{...props}
											class="aria-disabled:opacity-50"
											aria-disabled={busy || !resources.online}
											onclick={() => {
												if (!busy && resources.online) void resources.synchronize(true);
											}}>Send now</Button
										>{/snippet}</Tooltip.Trigger
								><Tooltip.Content
									>{!resources.online
										? 'Reconnect to send this change.'
										: busy
											? 'Wait for the current decision to finish.'
											: 'Send pending changes now.'}</Tooltip.Content
								></Tooltip.Root
							>
						{/if}
					</div>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</Tooltip.Provider>
