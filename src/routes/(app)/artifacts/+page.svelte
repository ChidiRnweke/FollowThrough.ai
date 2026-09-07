<script lang="ts">
	import { ArtifactLibrary } from '$lib/components/artifacts';
	let { data } = $props();
	const entries = $derived(
		data.selectedProjectId
			? data.session.resources.views.artifacts(data.selectedProjectId, data.query)
			: []
	);
	const page = $derived(
		Math.min(data.page, Math.max(1, Math.ceil(entries.length / data.pageSize)))
	);
	const gallery = $derived({
		...data,
		page,
		total: entries.length,
		artifacts: entries.slice((page - 1) * data.pageSize, page * data.pageSize),
		project: data.selectedProjectId
			? data.session.resources.views.get('projects', data.selectedProjectId)
			: undefined
	});
</script>

<ArtifactLibrary data={gallery} />
