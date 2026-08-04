<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { TodoId } from '$lib/models/todos';
	import { renderMarkdown } from '$lib/models/markdown';
	import { Textarea } from '$lib/components/ui/textarea';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import ImageZoom from '$lib/components/shared/image-zoom.svelte';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todos/todo-updates.svelte';
	import { uploadTodoScreenshot } from '../screenshot-upload';
	import {
		SCREENSHOT_MAX_BYTES,
		insertAtCaret,
		screenshotMarkdown,
		screenshotsFrom
	} from '../screenshot-markdown';

	let {
		todoId,
		projectId,
		value = '',
		id
	}: { todoId: TodoId; projectId: ProjectId; value?: string; id?: string } = $props();

	const initialValue = (): string => value;
	let saved = $state(initialValue());
	let draft = $state(initialValue());
	let editing = $state(false);
	let uploading = $state(false);
	let zoomed = $state<{ src: string; alt: string } | undefined>(undefined);
	let textarea = $state<HTMLTextAreaElement | undefined>(undefined);

	const rendered = $derived(renderMarkdown(saved));

	// Focus on entering edit mode: the preview is what the reader clicked, so the
	// caret has to follow into the textarea that replaces it.
	$effect(() => {
		if (editing) textarea?.focus();
	});

	async function commit(): Promise<void> {
		editing = false;
		if (draft === saved) return;
		if (await todoUpdates.updateTodo(todoId, { description: draft.trim() || null })) saved = draft;
		else {
			draft = saved;
			toast.error('Could not update the description.');
		}
	}

	function edit(): void {
		draft = saved;
		editing = true;
	}

	function keydown(event: KeyboardEvent): void {
		// Enter is a newline here, unlike the single-line fields: a description is
		// prose you paste screenshots into, and committing on Enter made every
		// paragraph break a save.
		if (event.key === 'Escape') {
			draft = saved;
			editing = false;
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void commit();
		}
	}

	/**
	 * Uploads first and only then touches the draft: a failed upload must not
	 * leave a link to bytes that were never stored.
	 */
	async function attach(files: readonly File[]): Promise<void> {
		const oversized = files.find((file) => file.size > SCREENSHOT_MAX_BYTES);
		if (oversized) {
			toast.error(`${oversized.name || 'That screenshot'} is larger than 10 MB.`);
			return;
		}
		uploading = true;
		try {
			for (const file of files) {
				const url = await uploadTodoScreenshot(todoId, projectId, file);
				const caretStart = textarea?.selectionStart ?? draft.length;
				const caretEnd = textarea?.selectionEnd ?? draft.length;
				const next = insertAtCaret(
					draft,
					caretStart,
					caretEnd,
					screenshotMarkdown(file.name || 'screenshot', url)
				);
				draft = next.text;
				textarea?.setSelectionRange(next.caret, next.caret);
			}
			await commit();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not upload the screenshot.');
		} finally {
			uploading = false;
		}
	}

	function paste(event: ClipboardEvent): void {
		const files = screenshotsFrom(event.clipboardData?.files);
		if (files.length === 0) return;
		event.preventDefault();
		void attach(files);
	}

	function drop(event: DragEvent): void {
		const files = screenshotsFrom(event.dataTransfer?.files);
		if (files.length === 0) return;
		event.preventDefault();
		if (!editing) edit();
		void attach(files);
	}

	/**
	 * One delegated handler rather than a component per image: the preview is
	 * `{@html}`, so its images are plain DOM nodes with nothing to mount onto.
	 */
	function previewClick(event: MouseEvent): void {
		const target = event.target;
		if (target instanceof HTMLImageElement) {
			zoomed = { src: target.src, alt: target.alt || 'Screenshot' };
			return;
		}
		if (!(target instanceof HTMLAnchorElement)) edit();
	}
</script>

{#if editing}
	<Textarea
		{id}
		bind:ref={textarea}
		aria-label="Todo description"
		class="field-sizing-content min-h-24"
		bind:value={draft}
		onblur={() => void commit()}
		onkeydown={keydown}
		onpaste={paste}
		ondrop={drop}
		disabled={todoUpdates.isPending(todoId) || uploading}
	/>
	<p class="text-xs text-muted-foreground">
		{uploading
			? 'Uploading screenshot…'
			: 'Markdown supported. Paste or drop a screenshot to attach it.'}
	</p>
{:else}
	<div
		class="prose prose-sm min-h-9 max-w-none cursor-text break-words rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 dark:prose-invert prose-pre:max-w-full prose-pre:overflow-x-auto prose-img:cursor-zoom-in prose-img:rounded-md prose-img:border prose-img:border-border"
		role="button"
		tabindex="0"
		aria-label="Todo description"
		onclick={previewClick}
		onkeydown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				edit();
			}
		}}
		ondrop={drop}
		ondragover={(event) => event.preventDefault()}
	>
		<ErrorBoundary label="this description" source={saved}>
			{#if rendered.ok}
				{#if rendered.html}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- Marked output is sanitized by DOMPurify in renderMarkdown. -->
					{@html rendered.html}
				{:else}
					<span class="text-muted-foreground">Add a description…</span>
				{/if}
			{:else}
				<pre class="whitespace-pre-wrap">{rendered.raw}</pre>
			{/if}
		</ErrorBoundary>
	</div>
{/if}

<ImageZoom image={zoomed} onclose={() => (zoomed = undefined)} />
