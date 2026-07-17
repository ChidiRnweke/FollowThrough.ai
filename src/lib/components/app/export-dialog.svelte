<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { generateDocument } from '$lib/remote/deliverables.remote';

	let {
		open = $bindable(false),
		projectId,
		defaultTitle = '',
		defaultNoteIds = [],
		templates = []
	}: {
		open?: boolean;
		projectId: string;
		defaultTitle?: string;
		defaultNoteIds?: string[];
		templates?: readonly { name: string }[];
	} = $props();

	let title = $state('');
	let format = $state<'docx' | 'pdf'>('docx');
	let busy = $state(false);
	let result = $state<{ url: string; artifactId: string } | null>(null);
	let error = $state('');

	$effect(() => {
		if (open) {
			title = defaultTitle;
			format = 'docx';
			result = null;
			error = '';
		}
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = title.trim();
		if (!trimmed) return;
		busy = true;
		error = '';
		try {
			const output = await generateDocument({
				projectId,
				noteIds: defaultNoteIds,
				title: trimmed,
				format
			});
			result = { url: output.downloadUrl, artifactId: output.artifact.id };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Export Document</Dialog.Title>
			<Dialog.Description>
				Generate a DOCX or PDF from the selected note content.
			</Dialog.Description>
		</Dialog.Header>

		<form class="flex flex-col gap-4" onsubmit={submit}>
			<Input bind:value={title} placeholder="Document title" aria-label="Title" disabled={busy} autofocus />

			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant={format === 'docx' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (format = 'docx')}
				>DOCX</Button>
				<Button
					type="button"
					variant={format === 'pdf' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (format = 'pdf')}
				>PDF</Button>
			</div>

			{#if result}
				<div class="flex flex-col items-center gap-2 rounded-md border p-3">
					<p class="text-sm font-medium">Document ready</p>
					<a
						href={result.url}
						download
						class="text-sm text-primary underline hover:no-underline"
					>
						Download
					</a>
					<a
						href="/artifacts?projectId={projectId}"
						class="text-xs text-muted-foreground underline"
					>
						View in Artifacts
					</a>
				</div>
			{/if}

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>
					{result ? 'Close' : 'Cancel'}
				</Button>
				{#if !result}
					<Button type="submit" disabled={busy || !title.trim()}>
						{busy ? 'Generating…' : 'Generate'}
					</Button>
				{/if}
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
