<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { SkillDetailWorkspace } from '$lib/components/skills';

	let { data } = $props();
	const skill = $derived(workspaceViews.skill(data.noteId));
</script>

{#if skill}
	{#key skill.noteId}<SkillDetailWorkspace {skill} />{/key}
{:else}<p>This skill is no longer available.</p>{/if}
