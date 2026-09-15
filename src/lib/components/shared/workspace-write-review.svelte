<script lang="ts">
	import { cn } from '$lib/utils';
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
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import CloudUpload from '@lucide/svelte/icons/cloud-upload';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import {
		SYNC_GAP_BOND,
		SYNC_GAP_ITEM,
		SYNC_GAP_GROUP,
		SYNC_GAP_KIND,
		SYNC_TITLE,
		SYNC_STATUS,
		SYNC_LABEL,
		SYNC_ROW_TITLE,
		SYNC_ROW_CAPTION
	} from './sync-review';
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
		writeTitle as title,
		writeGroup,
		writeExplanation,
		writeStatus,
		hasReviewContent
	} from '$lib/models/workspace-write-review';

	type Entry = OutboxEntry<WorkspaceCommand, WorkspaceRecord>;
	let { resources, open = $bindable(false) }: { resources: WorkspaceResources; open?: boolean } =
		$props();
	let reviewed = $state<readonly Entry[]>([]);
	let busy = $state(false);
	let confirmation = $state<'discard' | null>(null);
	let failure = $state<string | null>(null);
	$effect(() => {
		if (!resources.active) open = false;
		return () => {
			reviewed = [];
			open = false;
		};
	});
	$effect(() => {
		if (
			reviewed.length &&
			!busy &&
			!resources.pending.some(
				(entry) => entry.intent.operationId === reviewed[0].intent.operationId
			)
		) {
			reviewed = [];
			confirmation = null;
		}
	});
	const selected = $derived(
		resources.pending.find(
			(entry) => entry.intent.operationId === reviewed[0]?.intent.operationId
		) ?? reviewed[0]
	);
	const canDiscard = $derived(
		reviewed.length > 0 &&
			reviewed.every(
				(entry) =>
					entry.delivery.kind !== 'sending' && (entry.delivery.kind !== 'retry' || resources.online)
			)
	);
	const groups = [
		{ kind: 'decision', label: 'Needs a decision' },
		{ kind: 'waiting', label: 'Waiting to sync' },
		{ kind: 'sending', label: 'Syncing' }
	] as const;
	function downloadBlob(blob: Blob, name: string): void {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
	function review(entry: Entry): void {
		confirmation = null;
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
			confirmation = null;
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
			failure = error instanceof Error ? error.message : 'The latest version could not be loaded';
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
			class={cn(
				'flex max-h-full flex-col',
				SYNC_GAP_GROUP,
				selected &&
					['notes', 'diagrams'].includes(
						(selected.intent.local ?? selected.intent.base?.value)?.type ?? ''
					)
					? 'dialog-fill sm:max-w-7xl'
					: selected?.delivery.kind === 'conflict'
						? 'sm:max-w-3xl'
						: 'sm:max-w-xl'
			)}
		>
			<Dialog.Header class={cn('text-left', SYNC_GAP_ITEM)}>
				{#if selected}
					<Button
						variant="link"
						disabled={busy}
						class={cn('h-auto justify-start self-start p-0', SYNC_LABEL)}
						onclick={() => {
							reviewed = [];
							confirmation = null;
							failure = null;
						}}><FtChevronLeft class="size-3.5" />All changes</Button
					>
				{/if}
				<div class={cn('flex flex-col', SYNC_GAP_BOND)}>
					<Dialog.Title class={cn(SYNC_TITLE, 'pr-6')}
						>{selected ? title(selected) : 'Unsynced changes'}</Dialog.Title
					>
					<Dialog.Description class={cn('flex items-center', SYNC_GAP_BOND, SYNC_STATUS)}>
						{#if selected && writeGroup(selected) === 'decision'}<TriangleAlert
								class="size-3.5 shrink-0"
							/>
						{:else if !resources.online}<CloudOff class="size-3.5 shrink-0" />
						{:else}<CloudUpload class="size-3.5 shrink-0" />{/if}
						<span
							>{selected
								? writeStatus(selected)
								: `${resources.online ? 'On this device' : 'Offline'} · ${resources.pending.length} ${resources.pending.length === 1 ? 'change' : 'changes'} saved on this device`}</span
						>
					</Dialog.Description>
				</div>
			</Dialog.Header>
			{#if !selected || selected.intent.base || writeGroup(selected) === 'decision' || hasReviewContent(selected.intent.local, title(selected))}
				<div class={cn('flex min-h-0 flex-col overflow-auto', SYNC_GAP_GROUP)}>
					{#if selected}
						{#if writeGroup(selected) === 'decision'}<p
								role={selected.delivery.kind === 'rejected' ? 'alert' : 'status'}
								class={SYNC_STATUS}
							>
								{writeExplanation(selected, resources.online)}
							</p>{/if}
						<div
							class={selected.delivery.kind === 'conflict'
								? cn('grid md:grid-cols-2', SYNC_GAP_GROUP)
								: ''}
						>
							<WorkspaceRecordPreview
								label="Yours"
								showHeading={selected.delivery.kind === 'conflict'}
								title={selected.delivery.kind === 'conflict' ? '' : title(selected)}
								record={selected.intent.local}
								baseline={selected.intent.base?.value ?? null}
								absent="Delete this item"
							/>
							{#if selected.delivery.kind === 'conflict'}
								<WorkspaceRecordPreview
									label="Latest"
									record={selected.delivery.remote.kind === 'found'
										? selected.delivery.remote.snapshot.value
										: null}
									baseline={selected.intent.base?.value ?? null}
									absent={selected.delivery.remote.kind === 'deleted'
										? 'Deleted elsewhere'
										: 'Latest unavailable'}
								>
									{#snippet headerAction()}<Button
											variant="ghost"
											size="icon-sm"
											aria-label="Load latest"
											disabled={busy || !resources.online}
											onclick={() => void refreshConflict()}><RefreshCw class="size-3.5" /></Button
										>{/snippet}
								</WorkspaceRecordPreview>
							{/if}
						</div>
						{#if selected.intent.base || reviewed.length > 1}
							<div class={cn('flex flex-col', SYNC_GAP_ITEM)}>
								{#if selected.intent.base}<Collapsible.Root>
										<Collapsible.Trigger class={cn('flex items-center', SYNC_GAP_BOND, SYNC_LABEL)}
											><FtChevronDown class="size-3.5" />Original version</Collapsible.Trigger
										>
										<Collapsible.Content class="pt-3"
											><WorkspaceRecordPreview
												label="Original"
												showHeading={false}
												record={selected.intent.base.value}
											/></Collapsible.Content
										>
									</Collapsible.Root>{/if}
								{#if reviewed.length > 1}<Collapsible.Root>
										<Collapsible.Trigger class={cn('flex items-center', SYNC_GAP_BOND, SYNC_LABEL)}
											><FtChevronDown class="size-3.5" />Also affected ({reviewed.length -
												1})</Collapsible.Trigger
										>
										<Collapsible.Content class={cn('flex flex-col pt-3', SYNC_GAP_ITEM)}>
											{#each reviewed.slice(1) as entry (entry.intent.operationId)}<WorkspaceRecordPreview
													label={title(entry)}
													record={entry.intent.local}
												/>{/each}
										</Collapsible.Content>
									</Collapsible.Root>{/if}
							</div>
						{/if}
					{:else}
						<div class={cn('flex flex-col', SYNC_GAP_KIND)}>
							<div class={cn('flex flex-col', SYNC_GAP_GROUP)}>
								{#each groups as group (group.kind)}
									{@const entries = resources.pending.filter(
										(entry) => writeGroup(entry) === group.kind
									)}
									{#if entries.length}<section
											class={cn('flex flex-col', SYNC_GAP_ITEM)}
											aria-label={group.label}
										>
											<h3 class="eyebrow">{group.label}</h3>
											<div class={cn('flex flex-col', SYNC_GAP_ITEM)}>
												{#each entries as entry (entry.intent.operationId)}
													<Button
														variant="ghost"
														class="h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 text-left whitespace-normal"
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
														<Icon class="size-4 shrink-0 text-muted-foreground" />
														<span class={cn('flex min-w-0 flex-1 flex-col', SYNC_GAP_BOND)}
															><span class={SYNC_ROW_TITLE}>{title(entry)}</span><span
																class={SYNC_ROW_CAPTION}>{writeStatus(entry)}</span
															></span
														>
														<ChevronRight class="size-3.5 text-muted-foreground" />
													</Button>
												{/each}
											</div>
										</section>{/if}
								{/each}
							</div>
						</div>
						{#if !resources.pending.length}<EmptyState
								icon={FtCheck}
								title="Everything is saved"
								hint="There are no changes waiting for your decision."
								size="large"
							/>{/if}
					{/if}
				</div>
			{/if}
			{#if failure}<p role="alert" class="text-sm text-destructive">{failure}</p>{/if}
			{#if confirmation}
				<div class={cn('flex flex-col', SYNC_GAP_ITEM)} role="group" aria-label="Confirm removal">
					<p class="text-sm">
						{`Your change${reviewed.length > 1 ? ` and ${reviewed.length - 1} ${reviewed.length === 2 ? 'change that depends' : 'changes that depend'} on it` : ''} will be removed from this device.${selected?.delivery.kind === 'conflict' ? (selected.delivery.remote.kind === 'deleted' ? ' This item will remain deleted.' : selected.delivery.remote.kind === 'found' ? ' The latest copy will remain.' : ' The latest copy is unavailable.') : ''}`}
					</p>
					<div class="flex flex-wrap justify-end gap-3">
						<Button variant="ghost" disabled={busy} onclick={() => (confirmation = null)}
							>Cancel</Button
						>
						<Button
							variant="destructive"
							disabled={busy || !canDiscard}
							onclick={() => void resolve('discard')}>Discard change</Button
						>
					</div>
				</div>
			{:else if selected}
				<Dialog.Footer class="gap-3 sm:justify-between">
					<Button
						variant="ghost"
						class="justify-start px-0 text-muted-foreground"
						onclick={download}><FtDownload />Download a copy</Button
					>
					<div class="flex flex-wrap items-center justify-end gap-3">
						<Tooltip.Root>
							<Tooltip.Trigger
								>{#snippet child({ props })}<Button
										{...props}
										variant={selected.delivery.kind === 'conflict' ? 'outline' : 'ghost'}
										class="aria-disabled:opacity-50"
										aria-disabled={busy || !canDiscard}
										onclick={() => {
											if (!busy && canDiscard) confirmation = 'discard';
										}}
										>{selected.delivery.kind === 'conflict' &&
										selected.delivery.remote.kind === 'found'
											? 'Use latest…'
											: 'Discard…'}</Button
									>{/snippet}</Tooltip.Trigger
							>
							<Tooltip.Content
								>{!canDiscard
									? 'Reconnect before discarding. This change may already be saved.'
									: 'Review what will be removed.'}</Tooltip.Content
							>
						</Tooltip.Root>
						{#if selected.intent.base !== null && selected.delivery.kind === 'conflict' && selected.delivery.remote.kind === 'found'}<Button
								disabled={busy}
								onclick={() => void resolve('keep')}>Keep mine</Button
							>
						{:else if resources.online && (selected.delivery.kind === 'queued' || selected.delivery.kind === 'retry')}<Button
								variant="ghost"
								disabled={busy}
								onclick={() => void resources.synchronize(true)}>Sync now</Button
							>{/if}
					</div>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</Tooltip.Provider>
