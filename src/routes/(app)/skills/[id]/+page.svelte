<script lang="ts">
	import { SkillDetailWorkspace } from '$lib/components/skills';

	let { data } = $props();
	const skill = $derived(data.session.resources.views.skill(data.noteId));
</script>

{#if skill}
	{#key skill.noteId}<SkillDetailWorkspace {skill} />{/key}
{:else}<p>This skill is no longer available.</p>{/if}
