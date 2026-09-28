<script lang="ts">
	import { SkillCatalog } from '$lib/components/skills';

	let { data } = $props();
	const inboxProjectId = $derived.by(() => {
		const inbox = data.session.resources.views.projects.find((project) => project.role === 'inbox');
		if (!inbox) throw new Error('This workspace has no inbox; provisioning did not run.');
		return inbox.id;
	});
</script>

<SkillCatalog
	data={{ inboxProjectId: inboxProjectId, skills: data.session.resources.views.skills() }}
/>
