<script lang="ts">
	import type { HiddenAttachment } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';

	let { files, projectId }: { files: readonly HiddenAttachment[]; projectId: ProjectId } = $props();

	const reason = {
		queued: 'Waiting to be read',
		processing: 'Being read now',
		partial: 'Only partly read',
		unsupported: 'This file type cannot be read',
		failed: 'Could not be read'
	} as const;
</script>

<section class="flex flex-col gap-4" aria-labelledby="files-heading">
	<header class="flex items-baseline gap-3">
		<span class="text-4xl font-semibold tracking-tight text-warning tabular-nums"
			>{files.length}</span
		>
		<div class="flex flex-col">
			<h2 id="files-heading" class="text-base font-medium">
				{files.length === 1 ? "File it can't read" : "Files it can't read"}
			</h2>
			<p class="text-sm text-muted-foreground">
				The agent finds files by searching their text. Until these have text, it cannot use them.
			</p>
		</div>
	</header>
	<ul class="divide-y divide-border">
		{#each files as file (file.id)}
			<li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
				<Icon.Warning class="size-4 shrink-0 text-warning" />
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-medium" title={file.title}>{file.title}</span>
					<span class="text-xs text-muted-foreground"
						>{reason[file.status]}{#if file.failure}: {file.failure}{/if}</span
					>
				</div>
				<Button size="sm" variant="outline" href="/projects/{projectId}/attachments">
					<Icon.Attachment class="size-4" /> Fix in Attachments
				</Button>
			</li>
		{/each}
	</ul>
</section>
