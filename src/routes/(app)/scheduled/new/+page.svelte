<script lang="ts">
	import { scheduleViewer } from '$lib/client/schedules/viewer';
	import { ScheduleNew } from '$lib/components/schedules';

	const viewer = scheduleViewer();
</script>

<ScheduleNew now={viewer.now} timeZone={viewer.timeZone} />
