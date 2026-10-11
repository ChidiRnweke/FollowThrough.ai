<script lang="ts">
	import type { ContextItem } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import * as Icon from '$lib/components/icons';

	let { item, projectId }: { item: ContextItem; projectId: ProjectId } = $props();

	const glyph = {
		note: Icon.Document,
		attachment: Icon.Attachment,
		memory: Icon.Memory,
		skill: Icon.Skill
	} as const;
	const Glyph = $derived(glyph[item.kind]);

	/** Where each kind lives. Files and memory have no page of their own, only their list. */
	const href = $derived(
		item.kind === 'note'
			? `/notes/${item.id}`
			: item.kind === 'skill'
				? `/skills/${item.id}`
				: item.kind === 'attachment'
					? `/projects/${projectId}/attachments`
					: `/projects/${projectId}/memory`
	);
</script>

<a {href} class="flex min-w-0 items-center gap-2 hover:underline">
	<Glyph class="size-4 shrink-0 text-muted-foreground" />
	<span class="truncate" title={item.title}>{item.title}</span>
</a>
