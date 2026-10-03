<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';

	let { props }: BaseComponentProps<{ text: string; tone?: 'default' | 'muted' | null }> = $props();
</script>

<p
	data-slot="widget-text"
	class={props.tone === 'muted' ? 'text-sm text-muted-foreground' : 'text-sm text-foreground'}
>
	{props.text}
</p>
