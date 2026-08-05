<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Form } from '$lib/components/ui/form';
	import { captureNote } from '$lib/remote/notes/notes.remote';
	import { FtArrowRight as ArrowRight } from '$lib/components/icons';

	let { target = 'Inbox', focusOnMount = false }: { target?: string; focusOnMount?: boolean } =
		$props();
</script>

<Form {...captureNote}>
	<InputGroup.Root>
		<InputGroup.Addon align="inline-start">
			<InputGroup.Text class="text-muted-foreground">{target}</InputGroup.Text>
		</InputGroup.Addon>
		<InputGroup.Input
			id="quick-capture-input"
			{@attach (node: HTMLElement) => {
				if (focusOnMount) node.focus();
			}}
			{...captureNote.fields.title.as('text')}
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
</Form>
