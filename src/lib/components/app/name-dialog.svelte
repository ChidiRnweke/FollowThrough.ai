<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Form } from '$lib/components/ui/form';

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
		/** Return `false` to keep the dialog open so the value can be corrected. */
		onsubmit: (value: string) => boolean | void | Promise<boolean | void>;
	} = $props();

	let value = $state('');

	$effect(() => {
		if (open) value = initialValue;
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		if ((await onsubmit(trimmed)) === false) return;
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>
		<Form class="flex flex-col gap-4" onsubmit={submit}>
			<Input bind:value placeholder={label} aria-label={label} disabled={busy} autofocus />
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !value.trim()}>{submitLabel}</Button>
			</Dialog.Footer>
		</Form>
	</Dialog.Content>
</Dialog.Root>
