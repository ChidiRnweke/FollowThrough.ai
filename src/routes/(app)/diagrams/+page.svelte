<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { DiagramGallery } from '$lib/components/diagrams';
	let { data } = $props();
	const entries = $derived(
		data.selectedProjectId ? workspaceViews.diagrams(data.selectedProjectId, data.query) : []
	);
	const page = $derived(
		Math.min(data.page, Math.max(1, Math.ceil(entries.length / data.pageSize)))
	);
	const gallery = $derived({
		...data,
		page,
		total: entries.length,
		diagrams: entries.slice((page - 1) * data.pageSize, page * data.pageSize),
		project: data.selectedProjectId
			? workspaceViews.get('projects', data.selectedProjectId)
			: undefined
	});
</script>

<DiagramGallery data={gallery} />
