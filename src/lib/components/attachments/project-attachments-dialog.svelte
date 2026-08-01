<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import AttachmentList from './attachment-list.svelte';
	let { open = $bindable(false), projectId }: { open?: boolean; projectId: string } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-3xl">
		<Dialog.Header
			><Dialog.Title>Project attachments</Dialog.Title><Dialog.Description
				>Files and images the project agent can search.</Dialog.Description
			></Dialog.Header
		>
		<AttachmentList {projectId} />
	</Dialog.Content>
</Dialog.Root>
