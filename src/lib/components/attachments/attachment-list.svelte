<script lang="ts">
	import { attachmentsController } from '$lib/factories/attachments/capability';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { AttachmentView } from '$lib/models/attachments';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import EmptyState from '../shared/empty-state.svelte';
	import { attachmentStatusStyle, formatBytes } from '../shared/labels';
	import { toast } from 'svelte-sonner';
	import { FtAttachments as Paperclip, FtEllipsis as Ellipsis } from '$lib/components/icons';
	import { workspaceSession, workspaceViews } from '$lib/factories/workspace/session';
	import {
		downloadAttachment,
		removeAttachment,
		retryAttachment
	} from '$lib/remote/attachments/attachments.remote';

	let {
		owner,
		heroEmpty = false
	}: { owner: { kind: 'project' | 'note'; id: string }; heroEmpty?: boolean } = $props();

	let busy = $state(false);
	let removeTarget = $state<AttachmentView | undefined>(undefined);
	let blockedByNote = $state<{ id: string; title: string } | undefined>(undefined);
	let removeOpen = $state(false);

	const items = $derived(workspaceViews.attachments(owner));
	const ready = $derived(workspaceSession.current?.resources.collectionReadiness() === 'ready');
	let loadError = $state<string | null>(null);
	$effect(() => {
		const session = workspaceSession.current;
		if (!session) return;
		void session.resources.prepare().catch((error) => {
			loadError = error instanceof Error ? error.message : 'Could not load attachments';
			return { kind: 'failure', message: loadError };
		});
	});

	async function upload(file: File): Promise<void> {
		busy = true;
		const uploaded = await workspaceSession.serverChange(attachmentsController.upload(owner, file));
		busy = false;
		if (uploaded.kind === 'failure') toast.error(uploaded.message);
		else toast.success('Attachment queued for processing');
	}

	async function download(attachmentId: string): Promise<void> {
		const prepared = await downloadAttachment({ attachmentId }).then(
			(result) => ({ kind: 'ready' as const, url: result.url }),
			() => ({ kind: 'failure' as const })
		);
		if (prepared.kind === 'failure') toast.error('The attachment action failed');
		else window.open(prepared.url, '_blank', 'noopener,noreferrer');
	}

	async function retry(attachmentId: string): Promise<void> {
		const retried = await workspaceSession.serverChange(retryAttachment({ attachmentId }));
		if (retried.kind === 'failure') toast.error('The attachment action failed');
	}

	function askRemove(item: AttachmentView): void {
		removeTarget = item;
		blockedByNote = undefined;
		removeOpen = true;
	}

	async function confirmRemove(): Promise<void> {
		if (!removeTarget) return;
		const result = await remove(removeTarget.attachment.id);
		if (!result) return;
		if (result.kind === 'referenced-by-note') {
			blockedByNote = result.note;
			return;
		}
		removeOpen = false;
		removeTarget = undefined;
	}

	async function remove(attachmentId: string) {
		const removed = await workspaceSession.serverChange(removeAttachment({ attachmentId }));
		if (removed.kind === 'saved') return removed.value;
		toast.error(removed.message || 'The attachment could not be removed.');
		return undefined;
	}
</script>

{#snippet uploadButton()}
	<!-- The one primary action on the screen, so it wears the primary colour. It
	     stays a label wrapping the file input — a real button cannot open the picker. -->
	<Label class={buttonVariants({ size: 'sm' })}>
		{busy ? 'Uploading…' : 'Add attachment'}
		<Input
			class="sr-only"
			type="file"
			disabled={busy}
			onchange={(event) => {
				const file = event.currentTarget.files?.[0];
				if (file) void upload(file);
				event.currentTarget.value = '';
			}}
		/>
	</Label>
{/snippet}

<!-- The spacing ladder: a 24px step separates adding files from the files
     themselves, and 8px binds the list's heading to its rows. -->
<div class="flex flex-col gap-6">
	{#if loadError}<p role="alert">
			{loadError}
		</p>{:else if items.length === 0 && !ready}<p role="status">Still downloading attachments.</p>
		{@render uploadButton()}{:else if items.length === 0}
		<!-- An empty region is an invitation, not dead text: the one action the
		     space exists for sits inside the empty state. -->
		<EmptyState
			icon={Paperclip}
			title="No attachments yet."
			hint="Briefs, screenshots, and exports you add here ground the agent's answers in this project."
			size={heroEmpty ? 'large' : 'default'}
			label={heroEmpty ? 'Attachments' : undefined}
		>
			{#snippet action()}
				{@render uploadButton()}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			{@render uploadButton()}
			<Button variant="ghost" size="sm" onclick={() => void workspaceSession.synchronize()}
				>Refresh</Button
			>
		</div>
		<section class="flex flex-col gap-2">
			<h2 class="eyebrow">Files · {items.length}</h2>
			<!-- Homogeneous rows, so a borderless divided list — never a bordered box
			     wrapping same-weight rectangles. Bled 12px past the measure so filenames
			     align with the page text while hover washes and hairlines stay continuous. -->
			<ul class="-mx-3 divide-y divide-border border-t border-border">
				{#each items as item (item.attachment.id)}
					{@render row(item)}
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#snippet row(item: AttachmentView)}
	{@const status = attachmentStatusStyle(item.version.processingStatus)}
	<li class="group row-interactive flex items-center gap-3 px-3 py-2.5">
		{#if item.version.mediaType.startsWith('image/')}
			<img
				class="size-12 rounded-md border object-cover"
				src="/api/attachments/{item.attachment.id}/content"
				alt={item.version.extractedText || item.attachment.path}
			/>
		{/if}
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{item.attachment.path}</p>
			<p class="text-xs text-muted-foreground">
				{item.version.mediaType} · {formatBytes(item.version.byteSize)}
			</p>
			{#if item.version.processingFailure}<p class="text-xs text-destructive">
					{item.version.processingFailure}
				</p>{/if}
		</div>
		<Badge variant="secondary" class="shrink-0 gap-1.5">
			<span class={['size-1.5 rounded-full', status.dotClass]}></span>
			{item.version.processingStatus}
		</Badge>
		<!-- Row actions surface on hover, the documents-list pattern: the row stays
		     quiet and scannable instead of carrying three permanent buttons. The slot
		     keeps its space so nothing shifts when it appears. -->
		<div
			class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 has-data-[state=open]:opacity-100"
		>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="size-7"
							aria-label="Actions for {item.attachment.path}"
						>
							<Ellipsis class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={() => void download(item.attachment.id)}>
						Download
					</DropdownMenu.Item>
					{#if item.version.processingStatus === 'failed'}
						<DropdownMenu.Item onclick={() => void retry(item.attachment.id)}>
							Retry
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item variant="destructive" onclick={() => askRemove(item)}>
						Remove
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</li>
{/snippet}

<AlertDialog.Root bind:open={removeOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			{#if blockedByNote}
				<AlertDialog.Title>Remove the image from “{blockedByNote.title}” first.</AlertDialog.Title>
				<AlertDialog.Description>
					This attachment is still embedded in that note. Remove the image there, let the note save,
					then remove the attachment here.
				</AlertDialog.Description>
			{:else}
				<AlertDialog.Title>Remove this attachment?</AlertDialog.Title>
				<AlertDialog.Description>
					It will no longer be available to this project or its agents.
				</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer>
			{#if blockedByNote}
				<AlertDialog.Cancel>Close</AlertDialog.Cancel>
				<Button href="/notes/{blockedByNote.id}">Open {blockedByNote.title}</Button>
			{:else}
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action variant="destructive" onclick={() => void confirmRemove()}>
					Remove
				</AlertDialog.Action>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
