<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { scheduleViewer } from '$lib/client/schedules/viewer';
	import { ScheduleCatalog } from '$lib/components/schedules';

	const viewer = scheduleViewer();
</script>

<ScheduleCatalog rows={workspaceViews.schedules(viewer)} />
