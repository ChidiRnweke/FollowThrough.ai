<script lang="ts">
	import type { AttachmentView } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDelete from '$lib/components/app/confirm-delete.svelte';
	import { attachmentStatusStyle, formatBytes } from './labels';
	import { toast } from 'svelte-sonner';
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
		oncount
	}: {
		projectId?: string;
		noteId?: string;
		/** Server-loaded list, so the page renders its attachments without a client round trip. */
		initial?: readonly AttachmentView[];
		/** Reports how many attachments there are, for chrome that only makes sense with files. */
		oncount?: (count: number) => void;
	} = $props();

	let busy = $state(false);

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

	async function remove(attachmentId: string): Promise<void> {
		try {
			await removeAttachment({ attachmentId }).updates(listAttachments(owner));
		} catch {
			toast.error('The attachment could not be removed');
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<label
			class="tactile inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
		>
			{busy ? 'Uploading…' : 'Add attachment'}
			<input
				class="sr-only"
				type="file"
				disabled={busy}
				onchange={(event) => {
					const file = event.currentTarget.files?.[0];
					if (file) void upload(file);
					event.currentTarget.value = '';
				}}
			/>
		</label>
		<Button variant="ghost" size="sm" onclick={() => void query.refresh()}>Refresh</Button>
	</div>
	<div class="divide-y rounded-md border">
		{#each items as item (item.attachment.id)}
			{@const status = attachmentStatusStyle(item.version.processingStatus)}
			<div class="flex items-center gap-3 p-3">
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
				<span
					class={[
						'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
						status.badgeClass
					]}
				>
					<span class={['size-1.5 rounded-full', status.dotClass]}></span>
					{item.version.processingStatus}
				</span>
				<div class="flex gap-1">
					<Button variant="ghost" size="sm" onclick={() => void download(item.attachment.id)}>
						Download
					</Button>
					{#if item.version.processingStatus === 'failed'}<Button
							variant="ghost"
							size="sm"
							onclick={() => void retry(item.attachment.id)}>Retry</Button
						>{/if}
					<ConfirmDelete
						title="Remove this attachment?"
						description="It will no longer be available to this project or its agents."
						confirmLabel="Remove"
						onconfirm={() => remove(item.attachment.id)}
					>
						{#snippet trigger(props)}
							<Button {...props} variant="ghost" size="sm">Remove</Button>
						{/snippet}
					</ConfirmDelete>
				</div>
			</div>
		{:else}<p class="p-4 text-sm text-muted-foreground">No attachments yet.</p>{/each}
	</div>
</div>
