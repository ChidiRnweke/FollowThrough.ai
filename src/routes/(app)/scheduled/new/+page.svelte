<script lang="ts">
	import { scheduleViewer } from '$lib/client/schedules/viewer';
	import { ScheduleNew } from '$lib/components/schedules';

	let { data } = $props();
	const viewer = scheduleViewer();
</script>

<ScheduleNew
	now={viewer.now}
	timeZone={viewer.timeZone}
	models={data.session.agentModels}
	defaultModelId={data.session.agentDefaults.chatModelId}
/>
