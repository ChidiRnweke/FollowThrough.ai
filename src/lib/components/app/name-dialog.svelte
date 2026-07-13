<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let {
		open = $bindable(false),
		title,
		label = 'Name',
		submitLabel = 'Save',
		initialValue = '',
		busy = false,
		onsubmit
	}: {
		open?: boolean;
		title: string;
		label?: string;
		submitLabel?: string;
		initialValue?: string;
		busy?: boolean;
		onsubmit: (value: string) => void | Promise<void>;
	} = $props();

	let value = $state('');

	$effect(() => {
		if (open) value = initialValue;
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		await onsubmit(trimmed);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>
		<form class="flex flex-col gap-4" onsubmit={submit}>
			<Input bind:value placeholder={label} aria-label={label} disabled={busy} autofocus />
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !value.trim()}>{submitLabel}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
