<script lang="ts">
	import type { AgentExecutionMode } from '$lib/models/agent';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	let {
		value = $bindable(),
		compact = false,
		onchange
	}: {
		value: AgentExecutionMode;
		compact?: boolean;
		onchange?: (value: AgentExecutionMode) => void;
	} = $props();

	function changed(next: string | string[]): void {
		if (next !== 'approval_required' && next !== 'auto_accept') return;
		value = next;
		onchange?.(next);
	}
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	size={compact ? 'sm' : 'default'}
	{value}
	onValueChange={changed}
	aria-label="Agent execution mode"
>
	<ToggleGroup.Item value="approval_required" aria-label="Require approval for changes">
		Approval required
	</ToggleGroup.Item>
	<ToggleGroup.Item value="auto_accept" aria-label="Allow agent changes automatically">
		Auto-accept
	</ToggleGroup.Item>
</ToggleGroup.Root>
