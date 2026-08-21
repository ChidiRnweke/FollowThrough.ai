<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { UserPreferences } from '$lib/models/identity';
	import { saveDocumentPreferences } from '$lib/remote/settings/settings.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';

	let { preferences }: { preferences: UserPreferences } = $props();
	// Writable derived: the switch's local choice wins until a reload brings back
	// the stored preference.
	let sectionNumberingDefault = $derived(preferences.sectionNumberingDefault ?? false);

	// The switch already shows what was chosen, so without a toast a save reads as dead.
	const enhanced = saveDocumentPreferences.enhance(async (form) => {
		try {
			if (await form.submit()) toast.success('Document defaults saved');
			else toast.error('Could not save document defaults. Check the values and try again.');
		} catch {
			toast.error('Could not save document defaults. Try again.');
		}
	});
</script>

<Form {...enhanced} class="flex max-w-3xl flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
		<p class="text-sm text-muted-foreground">
			Defaults for how documents read. A project or a single document can still choose its own.
		</p>
		<Button type="submit">Save document defaults</Button>
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
			<Input type="hidden" name="sectionNumberingDefault" value={String(sectionNumberingDefault)} />
		</Field.Field>
	</Field.Group>
</Form>
