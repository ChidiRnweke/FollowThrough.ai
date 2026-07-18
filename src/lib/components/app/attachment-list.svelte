<script lang="ts">
	import type { AttachmentView } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';

	let { projectId, noteId }: { projectId?: string; noteId?: string } = $props();
	let items = $state<AttachmentView[]>([]);
	let busy = $state(false);

	onMount(() => {
		void refresh();
	});

	export async function refresh(): Promise<void> {
		const query = projectId ? `projectId=${projectId}` : `noteId=${noteId}`;
		const response = await fetch(`/api/attachments?${query}`);
		if (response.ok) items = await response.json();
	}

	const hex = (bytes: ArrayBuffer): string =>
		[...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

	async function upload(file: File): Promise<void> {
		busy = true;
		try {
			const checksumSha256 = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
			const initiated = await fetch('/api/attachments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId,
					noteId,
					path: file.name,
					mediaType: file.type || 'application/octet-stream',
					byteSize: file.size,
					checksumSha256
				})
			});
			if (!initiated.ok) throw new Error('The upload could not be prepared');
			const intent = await initiated.json();
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
			const completed = await fetch('/api/attachments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ op: 'complete', uploadId: intent.upload.id })
			});
			if (!completed.ok) throw new Error('The attachment could not be finalized');
			await refresh();
			toast.success('Attachment queued for processing');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Upload failed');
		} finally {
			busy = false;
		}
	}

	async function operation(op: 'retry' | 'downloadById', id: string): Promise<void> {
		const response = await fetch('/api/attachments', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ op, attachmentId: id })
		});
		if (!response.ok) {
			toast.error('The attachment action failed');
			return;
		}
		if (op === 'downloadById')
			window.open((await response.json()).url, '_blank', 'noopener,noreferrer');
		else await refresh();
	}

	async function remove(id: string): Promise<void> {
		if (!confirm('Remove this attachment?')) return;
		const response = await fetch('/api/attachments', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ attachmentId: id })
		});
		if (!response.ok) {
			toast.error('The attachment could not be removed');
			return;
		}
		await refresh();
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<label
			class="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
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
		<Button variant="ghost" size="sm" onclick={() => void refresh()}>Refresh</Button>
	</div>
	<div class="divide-y rounded-md border">
		{#each items as item (item.attachment.id)}
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
						{item.version.mediaType} · {item.version.byteSize} bytes
					</p>
					{#if item.version.processingFailure}<p class="text-xs text-destructive">
							{item.version.processingFailure}
						</p>{/if}
				</div>
				<Badge variant="secondary">{item.version.processingStatus}</Badge>
				<div class="flex gap-1">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => void operation('downloadById', item.attachment.id)}>Download</Button
					>
					{#if item.version.processingStatus === 'failed'}<Button
							variant="ghost"
							size="sm"
							onclick={() => void operation('retry', item.attachment.id)}>Retry</Button
						>{/if}
					<Button variant="ghost" size="sm" onclick={() => void remove(item.attachment.id)}
						>Remove</Button
					>
				</div>
			</div>
		{:else}<p class="p-4 text-sm text-muted-foreground">No attachments yet.</p>{/each}
	</div>
</div>
