<script lang="ts">
	import { onMount } from 'svelte';
	import { openPreferenceDraft } from '$lib/stores/workspace/account-preferences';
	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
	import { Form } from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';

	let sectionNumberingDefault = $state(false);

	// The switch already shows what was chosen, so without a toast a save reads as dead.
	let form = $state<
		| { kind: 'loading' }
		| { kind: 'ready'; draft: WorkspaceDraft<'user_preferences'> }
		| { kind: 'failure'; message: string }
	>({ kind: 'loading' });
	let busy = $state(false);
	onMount(() => {
		let cancelled = false;
		void openPreferenceDraft('user_preferences')
			.then(({ draft, value }) => {
				if (cancelled) return;
				sectionNumberingDefault = value.sectionNumberingDefault ?? false;
				form = { kind: 'ready', draft };
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : 'Preferences could not be opened';
				if (!cancelled) form = { kind: 'failure', message };
				return { kind: 'failure', message };
			});
		return () => {
			cancelled = true;
		};
	});
	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (form.kind !== 'ready' || busy) return;
		const value = form.draft.value;
		if (!value) {
			toast.error('Reopen these preferences before editing');
			return;
		}
		busy = true;
		try {
			const saved = await form.draft.stage({
				command: { kind: 'updateUserPreferences', userId: value.userId, sectionNumberingDefault },
				local: { type: 'user_preferences', value: { ...value, sectionNumberingDefault } },
				coalesce: null,
				references: []
			});
			if (saved.kind === 'failure') toast.error(saved.message);
			else toast.success('Document defaults saved on this device');
		} finally {
			busy = false;
		}
	}
</script>

{#if form.kind === 'failure'}
	<p role="alert" class="text-sm text-destructive">{form.message}</p>
{:else if form.kind === 'loading'}
	<p role="status" class="text-sm text-muted-foreground">Loading preferences…</p>
{:else}
	<Form onsubmit={save} class="flex max-w-3xl flex-col gap-6">
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
			<p class="text-sm text-muted-foreground">
				Defaults for how documents read. A project or a single document can still choose its own.
			</p>
			<Button type="submit" disabled={busy}>Save document defaults</Button>
		</div>

		<Field.Group>
			<Field.Field orientation="responsive">
				<Field.Content>
					<Field.Title>Section numbering</Field.Title>
					<Field.Description>
						Number headings like a Word document: 1. for H1, 1.1 for H2, down to H4.
					</Field.Description>
				</Field.Content>
				<Switch aria-label="Section numbering" bind:checked={sectionNumberingDefault} />
			</Field.Field>
		</Field.Group>
	</Form>
{/if}
