<script lang="ts">
	import type { AgentModel } from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import type { ScheduleStartView } from '$lib/models/schedules';
	import type { SkillSummary } from '$lib/models/skills';
	import { ModelInlinePicker } from '$lib/components/agent';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Popover from '$lib/components/ui/popover';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as Icon from '$lib/components/icons';
	import { mergeProps } from 'bits-ui';

	// The prompt of a schedule, with what each run starts with in a toolbar inside the field, as
	// the chat composer has. A chip stands only for a value that is set; the model always reads,
	// because every run has one.
	let {
		prompt,
		start,
		model,
		projects,
		skills,
		models,
		defaultModelId,
		disabled = false,
		onprompt,
		onproject,
		onskills,
		onmodel
	}: {
		prompt: string;
		/** The project and the skills the schedule names, as this device knows them. */
		start: ScheduleStartView;
		/** The schedule's own model, or null for its owner's default. */
		model: string | null;
		/** The projects and the skills that can be chosen. */
		projects: readonly Project[];
		skills: readonly SkillSummary[];
		models: readonly AgentModel[];
		defaultModelId: string;
		disabled?: boolean;
		/** The prompt as typed, on every keystroke. */
		onprompt: (prompt: string) => void;
		onproject: (projectId: ProjectId | null) => void;
		onskills: (skillNoteIds: readonly NoteId[]) => void;
		onmodel: (model: string | null) => void;
	} = $props();

	let adding = $state(false);

	const named = $derived(start.skills.map((skill) => skill.noteId));

	function chooseProject(projectId: ProjectId): void {
		adding = false;
		onproject(start.project?.id === projectId ? null : projectId);
	}

	/** The list stays open: a schedule often names more than one skill. */
	function toggleSkill(noteId: NoteId): void {
		onskills(
			named.includes(noteId) ? named.filter((other) => other !== noteId) : [...named, noteId]
		);
	}
</script>

<InputGroup.Root>
	<InputGroup.Textarea
		value={prompt}
		rows={4}
		class="min-h-16 px-3 text-sm leading-relaxed"
		placeholder="read my overdue todos and write a brief as a note in Inbox"
		aria-label="What the agent does"
		{disabled}
		oninput={(event) => onprompt(event.currentTarget.value)}
	/>
	<InputGroup.Addon align="block-end" class="flex-wrap gap-2">
		<Popover.Root bind:open={adding}>
			<Popover.Trigger>
				{#snippet child({ props: triggerProps })}
					<Tip text="Add a project or a skill">
						{#snippet children({ props: tipProps })}
							<Button
								{...mergeProps(triggerProps, tipProps)}
								variant="ghost"
								size="icon-xs"
								{disabled}
								aria-label="Add a project or a skill"
							>
								<Icon.Plus />
							</Button>
						{/snippet}
					</Tip>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-72 gap-0 p-0" side="bottom" align="start">
				<Popover.Header class="sr-only">
					<Popover.Title>What each run starts with</Popover.Title>
					<Popover.Description>
						Choose the project a run works in and the skills it loads.
					</Popover.Description>
				</Popover.Header>
				<Command.Root>
					<Command.Input placeholder="Search projects and skills…" />
					<Command.List class="max-h-72">
						<Command.Empty>No matching project or skill.</Command.Empty>
						<Command.Group heading="Project">
							{#each projects as project (project.id)}
								<Command.Item
									value={`project ${project.name} ${project.id}`}
									onSelect={() => chooseProject(project.id)}
								>
									<Icon.Check
										class={start.project?.id === project.id ? 'opacity-100' : 'opacity-0'}
									/>
									<span class="truncate">{project.name}</span>
								</Command.Item>
							{/each}
						</Command.Group>
						{#if skills.length > 0}
							<Command.Separator />
							<Command.Group heading="Skills">
								{#each skills as skill (skill.noteId)}
									<Command.Item
										value={`skill ${skill.name} ${skill.noteId}`}
										onSelect={() => toggleSkill(skill.noteId)}
									>
										<Icon.Check
											class={named.includes(skill.noteId) ? 'opacity-100' : 'opacity-0'}
										/>
										<span class="truncate">{skill.name}</span>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
		{#if start.project}
			{@const project = start.project}
			{@const name = project.kind === 'deleted' ? 'Deleted project' : project.name}
			<!-- A marked chip gets the room its mark takes, so the name still reads. -->
			<Badge
				variant="brand"
				class={[project.kind === 'archived' ? 'max-w-64' : 'max-w-44', 'gap-1 pr-1']}
			>
				<span class="truncate">{name}</span>
				{#if project.kind === 'archived'}
					<span class="shrink-0 text-xs text-muted-foreground">· archived</span>
				{/if}
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					{disabled}
					aria-label="Remove the project {name}"
					onclick={() => onproject(null)}
				>
					<Icon.Close />
				</Button>
			</Badge>
		{/if}
		{#each start.skills as skill (skill.noteId)}
			{@const name = skill.kind === 'deleted' ? 'Deleted skill' : skill.name}
			<Badge
				variant="secondary"
				class={[skill.kind === 'unavailable' ? 'max-w-64' : 'max-w-44', 'gap-1 pr-1']}
			>
				<Icon.Skill class="size-3 shrink-0" />
				<span class="truncate">{name}</span>
				{#if skill.kind === 'unavailable'}
					<span class="shrink-0 text-xs text-muted-foreground">· turned off</span>
				{/if}
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					{disabled}
					aria-label="Remove the skill {name}"
					onclick={() => onskills(named.filter((other) => other !== skill.noteId))}
				>
					<Icon.Close />
				</Button>
			</Badge>
		{/each}
		<!-- One `ml-auto`, as in the composer: the model keeps the right edge whatever is named. -->
		<div class="ml-auto flex min-w-0 shrink items-center">
			<ModelInlinePicker
				owner="schedule"
				{models}
				value={model}
				{defaultModelId}
				{disabled}
				onchange={onmodel}
			/>
		</div>
	</InputGroup.Addon>
</InputGroup.Root>
