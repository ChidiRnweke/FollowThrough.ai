<script lang="ts">
	import type { NoteSyncRecord } from '$lib/models/notes';
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
	<Dialog.Content class="dialog-fill flex flex-col sm:max-w-7xl">
		<Dialog.Header>
			<Dialog.Title>This note changed somewhere else</Dialog.Title>
			<Dialog.Description>
				Your device and the latest saved version both changed from the same base. Compare them
				before choosing which rich document to keep.
			</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root value="local" class="flex min-h-0 flex-1 flex-col">
			<Tabs.List>
				<Tabs.Trigger value="local">Your changes</Tabs.Trigger>
				<Tabs.Trigger value="remote">Latest saved version</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="local" class="min-h-0 flex-1 overflow-hidden">
				<NoteVersionDiff
					base={record.base.note.document}
					candidate={record.local.document}
					baseLabel="Shared base"
					candidateLabel="Your changes"
					baseTitle={record.base.note.title}
					candidateTitle={record.local.title}
				/>
			</Tabs.Content>
			<Tabs.Content value="remote" class="min-h-0 flex-1 overflow-hidden">
				<NoteVersionDiff
					base={record.base.note.document}
					candidate={record.remote?.note.document ?? record.base.note.document}
					baseLabel="Shared base"
					candidateLabel="Latest saved version"
					baseTitle={record.base.note.title}
					candidateTitle={record.remote?.note.title ?? record.base.note.title}
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
