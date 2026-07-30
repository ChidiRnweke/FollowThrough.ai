<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { AttachmentView } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import EmptyState from './empty-state.svelte';
	import { attachmentStatusStyle, formatBytes } from './labels';
	import { toast } from 'svelte-sonner';
	import { FtAttachments as Paperclip, FtEllipsis as Ellipsis } from '$lib/components/icons';
	import { fileChecksumSha256 } from '$lib/client/attachments/checksum';
	import {
		listAttachments,
		initiateAttachmentUpload,
		completeAttachmentUpload,
		downloadAttachment,
		retryAttachment,
		removeAttachment
	} from '$lib/remote/attachments.remote';

	let {
		projectId,
		noteId,
		initial,
		oncount,
		heroEmpty = false
	}: {
		projectId?: string;
		noteId?: string;
		/** Server-loaded list, so the page renders its attachments without a client round trip. */
		initial?: readonly AttachmentView[];
		/** Reports how many attachments there are, for chrome that only makes sense with files. */
		oncount?: (count: number) => void;
		/** The attachments page gets the hero-sized empty state; the dialog keeps the slot size. */
		heroEmpty?: boolean;
	} = $props();

	let busy = $state(false);
	let removeTarget = $state<string | undefined>(undefined);
	let removeOpen = $state(false);

	const owner = $derived<{ projectId?: string; noteId?: string }>(
		projectId ? { projectId } : { noteId }
	);

	// Mounted in the attachments page (which passes `initial`) and in a dialog (which
	// cannot, having no load function of its own), so the query has to cover both: it
	// backs the dialog outright, and elsewhere it carries post-mutation refreshes.
	const query = $derived(listAttachments(owner));
	const items = $derived<readonly AttachmentView[]>(query.current ?? initial ?? []);

	$effect(() => oncount?.(items.length));

	async function upload(file: File): Promise<void> {
		busy = true;
		try {
			const intent = await initiateAttachmentUpload({
				...owner,
				path: file.name,
				mediaType: file.type || 'application/octet-stream',
				byteSize: file.size,
				checksumSha256: await fileChecksumSha256(file)
			});
			const stored = await fetch(intent.uploadUrl, {
				method: 'PUT',
				headers: intent.requiredHeaders,
				body: file
			});
			if (!stored.ok) {
				const detail = (await stored.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
				throw new Error(
					detail
						? `Object storage rejected the upload: ${detail}`
						: `Object storage rejected the upload (${stored.status})`
				);
			}
			// Single-flight: the mutation and the refreshed list arrive in one response.
			await completeAttachmentUpload({ uploadId: intent.upload.id }).updates(
				listAttachments(owner)
			);
			toast.success('Attachment queued for processing');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Upload failed');
		} finally {
			busy = false;
		}
	}

	async function download(attachmentId: string): Promise<void> {
		try {
			const { url } = await downloadAttachment({ attachmentId });
			window.open(url, '_blank', 'noopener,noreferrer');
		} catch {
			toast.error('The attachment action failed');
		}
	}

	async function retry(attachmentId: string): Promise<void> {
		try {
			await retryAttachment({ attachmentId }).updates(listAttachments(owner));
		} catch {
			toast.error('The attachment action failed');
		}
	}

	function askRemove(attachmentId: string): void {
		removeTarget = attachmentId;
		removeOpen = true;
	}

	async function confirmRemove(): Promise<void> {
		if (removeTarget) await remove(removeTarget);
		removeOpen = false;
		removeTarget = undefined;
	}

	async function remove(attachmentId: string): Promise<void> {
		try {
			await removeAttachment({ attachmentId }).updates(listAttachments(owner));
		} catch {
			toast.error('The attachment could not be removed');
		}
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
	{#if items.length === 0}
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
			<Button variant="ghost" size="sm" onclick={() => void query.refresh()}>Refresh</Button>
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
					<DropdownMenu.Item variant="destructive" onclick={() => askRemove(item.attachment.id)}>
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
			<AlertDialog.Title>Remove this attachment?</AlertDialog.Title>
			<AlertDialog.Description>
				It will no longer be available to this project or its agents.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={() => void confirmRemove()}>
				Remove
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
