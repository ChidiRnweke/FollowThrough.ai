<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { TodoResponsibility, TodoView } from '$lib/models/todos';
	import { boardExportDate, boardExportSlug, boardMarkdown } from '$lib/models/todos';
	import { exportBoardPdf } from '$lib/remote/todos/todos.remote';
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

	let generatingPdf = $state(false);

	function download(content: Blob, filename: string): void {
		const url = URL.createObjectURL(content);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/* The Markdown export is the board exactly as seen — title search included — so it
	   is built from the todos the workspace passes in. The PDF is generated server-side,
	   where the title search cannot reach, so it reflects only the shareable URL filters. */
	function exportMarkdown(): void {
		const markdown = boardMarkdown(todos, {
			title: 'Todos',
			...(projectNames ? { projectNames } : {})
		});
		const filename = `kanban-${boardExportSlug(projectId ? 'project' : 'all')}-${boardExportDate(new Date())}.md`;
		download(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filename);
	}

	async function exportPdf(): Promise<void> {
		generatingPdf = true;
		try {
			const responsibility = page.url.searchParams.get(
				'responsibility'
			) as TodoResponsibility | null;
			const category = page.url.searchParams.get('category');
			const filterProjectId = projectId ?? page.url.searchParams.get('projectId');
			const result = await exportBoardPdf({
				...(filterProjectId ? { projectId: filterProjectId } : {}),
				...(responsibility === 'mine' || responsibility === 'waiting_on' ? { responsibility } : {}),
				...(category ? { category } : {})
			});
			const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0));
			download(new Blob([bytes], { type: 'application/pdf' }), result.filename);
		} catch {
			toast.error('Could not generate the PDF. Try again.');
		} finally {
			generatingPdf = false;
		}
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
