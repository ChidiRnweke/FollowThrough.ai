<script lang="ts">
	import { SkillCatalog } from '$lib/components/skills';

	let { data } = $props();
</script>

<SkillCatalog
	data={{ inboxProjectId: data.inboxProjectId, skills: data.session.resources.views.skills() }}
/>
