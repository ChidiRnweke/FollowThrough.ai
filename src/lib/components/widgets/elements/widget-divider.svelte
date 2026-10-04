<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { Separator } from '$lib/components/ui/separator';

	// A divider takes no props of its own; the registry still hands it the shared shape.
	const props: BaseComponentProps<Record<string, never>> = $props();
</script>

<Separator data-slot="widget-divider" aria-busy={props.loading ?? false} />
