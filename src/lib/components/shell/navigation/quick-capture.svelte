<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Form } from '$lib/components/ui/form';
	import { goto } from '$app/navigation';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import type { ProjectId } from '$lib/models/projects';
	import { FtArrowRight as ArrowRight } from '$lib/components/icons';

	let {
		projectId,
		target = 'Inbox',
		focusOnMount = false
	}: { projectId: ProjectId; target?: string; focusOnMount?: boolean } = $props();

	let title = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	async function capture(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy || !title.trim()) return;
		busy = true;
		error = null;
		try {
			const result = await projectActions.createNote(title, projectId);
			if (!result) {
				error = projectActions.lastError ?? 'The note could not be saved on this device';
				return;
			}
			title = '';
			await goto(`/notes/${result.note.id}`);
		} finally {
			busy = false;
		}
	}
</script>

<Form onsubmit={capture}>
	<InputGroup.Root>
		<InputGroup.Addon align="inline-start">
			<InputGroup.Text class="text-muted-foreground">{target}</InputGroup.Text>
		</InputGroup.Addon>
		<input type="hidden" name="projectId" value={projectId} />
		<InputGroup.Input
			id="quick-capture-input"
			{@attach (node: HTMLElement) => {
				if (focusOnMount) node.focus();
			}}
			name="title"
			bind:value={title}
			placeholder="Capture a note and start writing…"
			autocomplete="off"
			required
		/>
		<InputGroup.Addon align="inline-end">
			<InputGroup.Button type="submit" disabled={busy} aria-label="Create note" size="icon-xs">
				<ArrowRight class="size-4" />
			</InputGroup.Button>
		</InputGroup.Addon>
	</InputGroup.Root>
</Form>
{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
