<script lang="ts">
	import type { Note, NoteSummary, ShellContext } from '$lib/models';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { FtFolder as Folder } from '$lib/components/icons';

	let { shell, note }: { shell: ShellContext; note: Note } = $props();

	const project = $derived(shell.projects.find((candidate) => candidate.id === note.projectId));

	const folderChain = $derived.by(() => {
		const byId = new Map(shell.noteTree.map((entry) => [entry.id, entry]));
		const chain: NoteSummary[] = [];
		let parentId = note.parentId;
		let guard = 0;
		while (parentId && guard++ < 32) {
			const parent = byId.get(parentId);
			if (!parent) break;
			chain.unshift(parent);
			parentId = parent.parentId;
		}
		return chain;
	});
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#if project}
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/projects/{project.id}">{project.name}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
		{/if}
		{#each folderChain as folder (folder.id)}
			<Breadcrumb.Item>
				<span class="flex items-center gap-1 text-muted-foreground">
					<Folder class="size-3" />
					{folder.title}
				</span>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
		{/each}
		<Breadcrumb.Item>
			<Breadcrumb.Page class="max-w-48 truncate">{note.title}</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.List>
</Breadcrumb.Root>
