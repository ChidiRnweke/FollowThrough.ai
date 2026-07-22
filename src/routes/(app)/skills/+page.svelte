<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import Pin from '@lucide/svelte/icons/pin';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { goto, invalidateAll } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { createSkill } from '$lib/remote/projects.remote';
	import { toggleSkill } from '$lib/remote/skills.remote';
	import type { NoteId } from '$lib/models';

	let { data } = $props();

	let createOpen = $state(false);
	let creating = $state(false);
	let draftName = $state('');
	const togglingIds = new SvelteSet<NoteId>();

	async function submitCreate(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const name = draftName.trim();
		if (!name || creating) return;
		creating = true;
		try {
			const { skill } = await createSkill({ name });
			createOpen = false;
			draftName = '';
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
								<Badge variant="ghost" class="font-mono text-xs text-muted-foreground">{hint}</Badge>
							{/each}
						</div>
						<ChevronRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New skill</Dialog.Title>
			<Dialog.Description>
				A skill is a single note the agent loads when a task matches. Name it, then write the
				instructions.
			</Dialog.Description>
		</Dialog.Header>
		<form class="flex flex-col gap-4" onsubmit={submitCreate}>
			<Input
				bind:value={draftName}
				placeholder="e.g. Reviewing pull requests"
				aria-label="Skill name"
				disabled={creating}
			/>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (createOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={creating || !draftName.trim()}>Create skill</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
