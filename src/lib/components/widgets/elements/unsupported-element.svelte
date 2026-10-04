<script lang="ts">
	import type { UIElement } from '@json-render/svelte';

	let { element }: { element: UIElement } = $props();
</script>

<!-- A stored layout can name a component a later catalog removed (ADR 0043). It is shown, not
     dropped, so the element stays visible and stays in the saved layout. -->
<p
	data-slot="widget-unsupported"
	class="rounded-md border border-dashed px-3 py-2 text-label text-muted-foreground"
>
	This widget uses a {element.type} element, which this version cannot show.
</p>
