<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { SkillCatalog } from '$lib/components/skills';

	let { data } = $props();
	const inboxProjectId = $derived.by(() => {
		const inbox = workspaceViews.projects.find((project) => project.role === 'inbox');
		if (!inbox) throw new Error('This workspace has no inbox; provisioning did not run.');
		return inbox.id;
	});
</script>

<SkillCatalog
	data={{ inboxProjectId: inboxProjectId, skills: workspaceViews.skills() }}
/>
