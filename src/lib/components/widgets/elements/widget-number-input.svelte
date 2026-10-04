<script lang="ts">
	import { getBoundProp, type BaseComponentProps } from '@json-render/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		props,
		bindings
	}: BaseComponentProps<{
		label: string;
		value: number;
		min?: number | null;
		max?: number | null;
		step?: number | null;
	}> = $props();

	const value = getBoundProp<number>(
		() => props.value,
		() => bindings?.value
	);
	const id = $props.id();

	// An emptied or non-numeric field keeps the last number rather than saving nothing.
	const write = (raw: string) => {
		const parsed = Number(raw);
		if (raw.trim() !== '' && Number.isFinite(parsed)) value.current = parsed;
	};
</script>

<div data-slot="widget-number-input" class="flex w-32 flex-col gap-1.5">
	<Label for={id}>{props.label}</Label>
	<Input
		{id}
		type="number"
		inputmode="decimal"
		min={props.min ?? undefined}
		max={props.max ?? undefined}
		step={props.step ?? undefined}
		value={value.current ?? ''}
		oninput={(event) => write(event.currentTarget.value)}
	/>
</div>
