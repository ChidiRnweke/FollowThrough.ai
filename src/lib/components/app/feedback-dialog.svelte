<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { appContext } from '$lib/stores/app-context.svelte';
	import { submitFeedback } from '$lib/remote/feedback.remote';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let body = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) body = '';
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = body.trim();
		if (!trimmed || busy) return;
		busy = true;
		try {
			const snapshot = appContext.capture();
			await submitFeedback({
				body: trimmed,
				url: page.url.pathname + page.url.search,
				appContext: snapshot as unknown as Record<string, unknown>
			});
			open = false;
			toast.success('Feedback sent — thank you!');
		} catch {
			toast.error('Could not send feedback. Try again.');
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Send feedback</Dialog.Title>
			<Dialog.Description>Bug, suggestion, or anything else.</Dialog.Description>
		</Dialog.Header>
		<Form class="flex flex-col gap-4" onsubmit={submit}>
			<Textarea
				bind:value={body}
				placeholder="What's on your mind?"
				rows={4}
				disabled={busy}
				autofocus
			/>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !body.trim()}>Send</Button>
			</Dialog.Footer>
		</Form>
	</Dialog.Content>
</Dialog.Root>
