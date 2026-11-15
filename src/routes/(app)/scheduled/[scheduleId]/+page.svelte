<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { scheduleViewer } from '$lib/client/schedules/viewer';
	import { openConversationSurface } from '$lib/client/shell/responsive-surfaces';
	import { ScheduleDetail } from '$lib/components/schedules';

	let { data } = $props();
	const viewer = scheduleViewer();
	const detail = $derived(workspaceViews.schedule(data.scheduleId, viewer));
</script>

{#if detail}
	{#key detail.schedule.id}
		<ScheduleDetail
			{detail}
			models={data.session.agentModels}
			defaultModelId={data.session.agentDefaults.chatModelId}
			onopenrun={openConversationSurface}
		/>
	{/key}
{:else}<p>This schedule is no longer available.</p>{/if}
