<script lang="ts">
	import type { Project, ProjectId } from '$lib/models/projects';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	let {
		open = $bindable(false),
		projects,
		busy = false,
		onconfirm
	}: {
		open?: boolean;
		projects: readonly Project[];
		busy?: boolean;
		onconfirm: (projectId: ProjectId) => void | Promise<void>;
	} = $props();

	let selected = $state('');
	const selectedProject = $derived(projects.find((project) => project.id === selected));

	async function confirm(): Promise<void> {
		if (!selectedProject) return;
		await onconfirm(selectedProject.id);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>What project does this diagram belong to?</Dialog.Title>
			<Dialog.Description>
				The diagram will be saved there. The conversation stays where it started.
			</Dialog.Description>
		</Dialog.Header>
		{#if projects.length}
			<div class="flex flex-col gap-2">
				<Label for="diagram-project">Project</Label>
				<Select.Root type="single" value={selected} onValueChange={(value) => (selected = value)}>
					<Select.Trigger id="diagram-project" class="w-full" aria-label="Diagram project">
						{selectedProject?.name ?? 'Choose a project'}
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each projects as project (project.id)}
								<Select.Item value={project.id}>{project.name}</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				Create a project from the sidebar, then return to keep this diagram.
			</p>
		{/if}
		<Dialog.Footer>
			<Button variant="ghost" disabled={busy} onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={busy || !selectedProject} onclick={() => void confirm()}>
				Keep diagram
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
