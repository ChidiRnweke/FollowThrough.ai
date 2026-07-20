<script lang="ts" module>
	export interface WorkspaceSplitResizer {
		initialSecondaryRatio: number;
		onRatioChange: (secondaryRatio: number) => void;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { PaneAPI } from 'paneforge';
	import * as Resizable from '$lib/components/ui/resizable';

	let { initialSecondaryRatio, onRatioChange }: WorkspaceSplitResizer = $props();

	const secondaryPercent = $derived(initialSecondaryRatio * 100);
	let secondaryPane: PaneAPI | undefined = $state();
	let lastInputRatio = $state(untrack(() => initialSecondaryRatio));

	$effect(() => {
		if (Math.abs(initialSecondaryRatio - lastInputRatio) > 0.0001) {
			lastInputRatio = initialSecondaryRatio;
			secondaryPane?.resize(initialSecondaryRatio * 100);
		}
		return () => undefined;
	});

	function onLayoutChange(layout: number[]): void {
		const nextSecondaryPercent = layout[1];
		if (nextSecondaryPercent === undefined) return;
		onRatioChange(nextSecondaryPercent / 100);
	}

	function resetRatio(): void {
		secondaryPane?.resize(50);
		onRatioChange(0.5);
	}
</script>

<Resizable.PaneGroup
	direction="horizontal"
	keyboardResizeBy={5}
	{onLayoutChange}
	class="workspace-split-resizer-group"
>
	<Resizable.Pane defaultSize={100 - secondaryPercent} minSize={25} maxSize={75} />
	<Resizable.Handle
		aria-label="Resize note panes"
		class="workspace-split-resizer-handle"
		ondblclick={resetRatio}
	/>
	<Resizable.Pane
		bind:this={secondaryPane}
		defaultSize={secondaryPercent}
		minSize={25}
		maxSize={75}
	/>
</Resizable.PaneGroup>
