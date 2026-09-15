<script lang="ts">
	import { DiagramGallery } from '$lib/components/diagrams';
	let { data } = $props();
	const entries = $derived(
		data.selectedProjectId
			? data.session.resources.views.diagrams(data.selectedProjectId, data.query)
			: []
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
			? data.session.resources.views.get('projects', data.selectedProjectId)
			: undefined
	});
</script>

<DiagramGallery data={gallery} />
