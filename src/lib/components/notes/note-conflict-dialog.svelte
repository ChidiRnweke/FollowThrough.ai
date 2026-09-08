<script lang="ts">
	import type { Note } from '$lib/models/notes';
	import type { WriteConflictView } from '$lib/models/outbox';
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
		record: WriteConflictView<Note>;
		onUseRemote: () => Promise<void>;
		onKeepLocal: () => Promise<void>;
	} = $props();

	let resolving = $state<'remote' | 'local' | undefined>(undefined);
	let failure = $state<string | null>(null);

	async function resolve(choice: 'remote' | 'local'): Promise<void | { kind: 'failure' }> {
		resolving = choice;
		failure = null;
		try {
			if (choice === 'remote') await onUseRemote();
			else await onKeepLocal();
			open = false;
		} catch (error) {
			failure = error instanceof Error ? error.message : 'The conflict could not be resolved';
			return { kind: 'failure' };
		} finally {
			resolving = undefined;
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
				{#if record.local}<NoteVersionDiff
						base={record.base?.document ?? { type: 'doc', content: [] }}
						candidate={record.local.document}
						baseLabel="Shared base"
						candidateLabel="Your changes"
						baseTitle={record.base?.title ?? 'New local note'}
						candidateTitle={record.local.title}
					/>
				{:else}<p>Your local edit deletes this note.</p>{/if}
			</Tabs.Content>
			<Tabs.Content value="remote" class="min-h-0 flex-1 overflow-hidden">
				{#if record.remote.kind === 'found'}
					<NoteVersionDiff
						base={record.base?.document ?? { type: 'doc', content: [] }}
						candidate={record.remote.value.document}
						baseLabel="Shared base"
						candidateLabel="Latest saved version"
						baseTitle={record.base?.title ?? 'New local note'}
						candidateTitle={record.remote.value.title}
					/>
				{:else}
					<p>
						{record.remote.kind === 'deleted'
							? 'This note was deleted on the server. Your local changes are still retained.'
							: 'The server copy is unavailable. Your local changes are still retained.'}
					</p>
				{/if}
			</Tabs.Content>
		</Tabs.Root>

		{#if failure}<p role="alert">{failure}</p>{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Review later</Button>
			<Button
				variant="secondary"
				disabled={resolving !== undefined || record.remote.kind !== 'found'}
				onclick={() => void resolve('remote')}
			>
				{#if resolving === 'remote'}<Spinner data-icon="inline-start" />{/if}
				Use latest
			</Button>
			<Button
				disabled={resolving !== undefined || record.remote.kind !== 'found'}
				onclick={() => void resolve('local')}
			>
				{#if resolving === 'local'}<Spinner data-icon="inline-start" />{/if}
				Keep mine
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
