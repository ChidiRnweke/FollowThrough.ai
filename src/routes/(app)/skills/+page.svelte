<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		FtPin as Pin,
		FtPlus as Plus,
		FtChevronRight as ChevronRight
	} from '$lib/components/icons';
	import { goto, invalidateAll } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { createSkill } from '$lib/remote/projects.remote';
	import { saveSkillDraft, toggleSkill } from '$lib/remote/skills.remote';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';
	import type { NoteId } from '$lib/models';

	let { data } = $props();

	let createOpen = $state(false);
	let creating = $state(false);
	let step = $state<1 | 2>(1);
	let draftName = $state('');
	let draftDescription = $state('');
	let draftInstructions = $state('');
	const togglingIds = new SvelteSet<NoteId>();

	function resetWizard(): void {
		step = 1;
		draftName = '';
		draftDescription = '';
		draftInstructions = '';
	}

	async function submitCreate(): Promise<void> {
		const name = draftName.trim();
		if (!name || creating) return;
		creating = true;
		try {
			const { skill } = await createSkill({ name });
			const description = draftDescription.trim();
			const instructions = draftInstructions.trim();
			if (description || instructions) {
				await saveSkillDraft({ noteId: skill.note.id, description, instructions });
			}
			createOpen = false;
			resetWizard();
			await goto(`/skills/${skill.note.id}`);
		} catch {
			toast.error('Could not create the skill. Try again.');
		} finally {
			creating = false;
		}
	}

	async function toggle(noteId: NoteId, enabled: boolean): Promise<void> {
		togglingIds.add(noteId);
		try {
			await toggleSkill({ noteId, enabled });
			await invalidateAll();
		} catch {
			toast.error('Could not update the skill. Try again.');
		} finally {
			togglingIds.delete(noteId);
		}
	}
</script>

<PageShell title="Skills" description="Reusable methodology the agent loads when a task matches.">
	{#snippet actions()}
		<AgentAction action={agentActions.skills} />
		<Button onclick={() => (createOpen = true)}><Plus data-icon="inline-start" />New skill</Button>
	{/snippet}

	{#if data.skills.length === 0}
		<p class="text-sm text-muted-foreground">
			No skills yet. Create one, or select a reusable structure in a note and save it as a skill.
		</p>
	{:else}
		<ul class="divide-y divide-border rounded-md border border-border">
			{#each data.skills as skill (skill.noteId)}
				<li class="flex items-center gap-3 px-4 py-3">
					<Switch
						checked={skill.isEnabled}
						disabled={togglingIds.has(skill.noteId)}
						aria-label={skill.isEnabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
						onCheckedChange={(checked) => void toggle(skill.noteId, checked)}
					/>
					<a
						href="/skills/{skill.noteId}"
						class={[
							'row-interactive -my-3 flex min-w-0 flex-1 items-center gap-3 py-3',
							!skill.isEnabled && 'opacity-60'
						]}
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-medium">{skill.name}</span>
								{#if skill.isPinned}
									<Pin class="size-3.5 shrink-0 text-muted-foreground" />
								{/if}
							</div>
							<p class="truncate text-sm text-muted-foreground">{skill.description}</p>
						</div>
						<div class="hidden shrink-0 items-center gap-1 lg:flex">
							{#each skill.triggerHints.slice(0, 3) as hint (hint)}
								<Badge variant="ghost" class="font-mono text-xs text-muted-foreground">{hint}</Badge
								>
							{/each}
						</div>
						<ChevronRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>

<Dialog.Root
	bind:open={createOpen}
	onOpenChange={(open) => {
		if (!open) resetWizard();
	}}
>
	<Dialog.Content class="sm:max-w-md">
		{#if step === 1}
			<Dialog.Header>
				<Dialog.Title>Describe your skill</Dialog.Title>
				<Dialog.Description>
					When should your agent trigger it? This is what the agent reads to decide when to load the
					skill.
				</Dialog.Description>
			</Dialog.Header>
			<Form
				class="flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					if (draftName.trim()) step = 2;
				}}
			>
				<Input
					bind:value={draftName}
					placeholder="e.g. Reviewing pull requests"
					aria-label="Skill name"
				/>
				<Textarea
					bind:value={draftDescription}
					class="min-h-24 rounded-md border bg-background p-3 text-sm"
					placeholder="Use this skill when reviewing code changes, checking for bugs, style issues, and missed edge cases…"
					aria-label="When should your agent trigger this skill?"
				/>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (createOpen = false)}>Cancel</Button>
					<Button type="submit" disabled={!draftName.trim()}>Next</Button>
				</Dialog.Footer>
			</Form>
		{:else}
			<Dialog.Header>
				<Dialog.Title>What should the agent do?</Dialog.Title>
				<Dialog.Description>
					Markdown instructions the agent follows when this skill loads. You can also draft them on
					the canvas afterwards.
				</Dialog.Description>
			</Dialog.Header>
			<Form
				class="flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					void submitCreate();
				}}
			>
				<Textarea
					bind:value={draftInstructions}
					class="min-h-40 rounded-md border bg-background p-3 font-mono text-xs"
					placeholder="## Steps&#10;1. Read the diff…&#10;2. Check for…"
					aria-label="Skill instructions"
					disabled={creating}
				/>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (step = 1)} disabled={creating}>
						Back
					</Button>
					<Button type="submit" disabled={creating}>Create skill</Button>
				</Dialog.Footer>
			</Form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
