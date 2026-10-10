<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { TodoView } from '$lib/models/todos';
	import { createTodoBoardExports } from '$lib/factories/todos/board-export';
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { buttonVariants } from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { FtDownload as Download } from '$lib/components/icons';

	let {
		todos,
		projectId,
		projectNames
	}: {
		todos: readonly TodoView[];
		projectId?: ProjectId;
		projectNames?: ReadonlyMap<ProjectId, string>;
	} = $props();

	const exports = createTodoBoardExports();
	const generatingPdf = $derived(exports.generatingPdf);
	onDestroy(() => exports.close());
	function exportMarkdown(): void {
		exports.markdown(todos, projectId, projectNames);
	}
	async function exportPdf(): Promise<void> {
		const result = await exports.pdf(page.url, projectId);
		if (result.kind === 'failure') toast.error(result.message);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="{buttonVariants({ variant: 'outline', size: 'sm' })} h-11 sm:h-8"
		disabled={generatingPdf}
		aria-label="Export board"
	>
		<Download class="size-3.5" />
		{generatingPdf ? 'Exporting…' : 'Export'}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content>
			<DropdownMenu.Item onclick={exportMarkdown}>Markdown (.md)</DropdownMenu.Item>
			<DropdownMenu.Item onclick={() => void exportPdf()} disabled={generatingPdf}>
				PDF (.pdf)
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
