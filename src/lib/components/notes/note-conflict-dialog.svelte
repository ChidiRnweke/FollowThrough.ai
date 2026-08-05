<script lang="ts">
	import type { NoteSyncRecord } from '$lib/models/notes';
	import { noteRevisionText } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import NoteVersionDiff from './note-version-diff.svelte';

	let {
		open = $bindable(false),
		record,
		onUseRemote,
		onKeepLocal
	}: {
		open?: boolean;
		record: NoteSyncRecord;
		onUseRemote: () => Promise<void>;
		onKeepLocal: () => Promise<void>;
	} = $props();

	let resolving = $state<'remote' | 'local' | undefined>(undefined);

	async function resolve(choice: 'remote' | 'local'): Promise<void> {
		resolving = choice;
		try {
			if (choice === 'remote') await onUseRemote();
			else await onKeepLocal();
		} finally {
			// The choice is applied to the device copy before anything that can
			// fail; leaving the dialog open with both buttons disabled would strand
			// the note behind a decision that has already been made.
			resolving = undefined;
			open = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-dvh flex-col sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>This note changed somewhere else</Dialog.Title>
			<Dialog.Description>
				Your device and the latest saved version both changed from the same base. Compare them
				before choosing which rich document to keep.
			</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root value="local" class="min-h-0">
			<Tabs.List>
				<Tabs.Trigger value="local">Your changes</Tabs.Trigger>
				<Tabs.Trigger value="remote">Latest saved version</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="local">
				<NoteVersionDiff
					base={noteRevisionText(record.base.note)}
					candidate={noteRevisionText(record.local)}
					label="Your changes"
				/>
			</Tabs.Content>
			<Tabs.Content value="remote">
				<NoteVersionDiff
					base={noteRevisionText(record.base.note)}
					candidate={noteRevisionText(record.remote?.note ?? record.base.note)}
					label="Latest saved version"
				/>
			</Tabs.Content>
		</Tabs.Root>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Review later</Button>
			<Button
				variant="secondary"
				disabled={resolving !== undefined}
				onclick={() => void resolve('remote')}
			>
				{#if resolving === 'remote'}<Spinner data-icon="inline-start" />{/if}
				Use latest
			</Button>
			<Button disabled={resolving !== undefined} onclick={() => void resolve('local')}>
				{#if resolving === 'local'}<Spinner data-icon="inline-start" />{/if}
				Keep mine
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
