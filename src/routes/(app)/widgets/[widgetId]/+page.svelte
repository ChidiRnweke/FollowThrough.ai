<script lang="ts">
	import { WidgetPane } from '$lib/components/widgets';

	let { data } = $props();
</script>

<!-- A widget on its own: the link a note's embed opens, and a page that can be shared. -->
<div class="flex min-h-0 flex-1 flex-col">
	<WidgetPane widgetId={data.widgetId} />
</div>
