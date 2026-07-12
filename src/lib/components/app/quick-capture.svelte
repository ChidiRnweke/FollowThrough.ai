<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group';
	import ActionForm from '$lib/components/primitives/action-form.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	let { action = '?/capture' }: { action?: string } = $props();
</script>

<ActionForm {action}>
	<InputGroup.Root>
		<InputGroup.Input
			name="title"
			placeholder="Capture a note and start writing…"
			autocomplete="off"
			required
		/>
		<InputGroup.Addon align="inline-end">
			<InputGroup.Button type="submit" aria-label="Create note" size="icon-xs">
				<ArrowRight class="size-4" />
			</InputGroup.Button>
		</InputGroup.Addon>
	</InputGroup.Root>
</ActionForm>
