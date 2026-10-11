<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { WidgetGallery } from '$lib/components/widgets';
	let { data } = $props();
	const entries = $derived(
		data.selectedProjectId
			? workspaceViews.widgets(data.selectedProjectId, data.query)
			: []
	);
	const page = $derived(
		Math.min(data.page, Math.max(1, Math.ceil(entries.length / data.pageSize)))
	);
	const gallery = $derived({
		...data,
		page,
		total: entries.length,
		widgets: entries.slice((page - 1) * data.pageSize, page * data.pageSize),
		project: data.selectedProjectId
			? workspaceViews.get('projects', data.selectedProjectId)
			: undefined
	});
</script>

<WidgetGallery data={gallery} />
