<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import {
		FtArtifacts as Archive,
		FtDocument as FileIcon,
		FtClose as X
	} from '$lib/components/icons';
	import { formatBytes } from './labels';

	let {
		file = $bindable(),
		accept,
		extensions,
		maxBytes,
		hint,
		disabled = false,
		label = 'Choose a file or drag it here'
	}: {
		file?: File | undefined;
		/** Passed to the native input, which is what the file picker filters on. */
		accept?: string;
		/** Checked on drop, where the browser applies no filter of its own. */
		extensions?: readonly string[];
		maxBytes?: number;
		hint?: string;
		disabled?: boolean;
		label?: string;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let rejection = $state('');
	/**
	 * Depth rather than a boolean: `dragleave` fires when the pointer crosses onto a child
	 * element, so a boolean flickers the highlight off while the pointer is still inside.
	 */
	let dragDepth = $state(0);
	const dragging = $derived(dragDepth > 0);

	const accepted = (candidate: File): string => {
		if (extensions && !extensions.some((suffix) => candidate.name.toLowerCase().endsWith(suffix)))
			return `That is not a ${extensions.join(' or ')} file.`;
		if (maxBytes && candidate.size > maxBytes)
			return `That file is ${formatBytes(candidate.size)}, over the ${formatBytes(maxBytes)} limit.`;
		return '';
	};

	function take(candidate: File | undefined): void {
		if (!candidate) return;
		const problem = accepted(candidate);
		rejection = problem;
		file = problem ? undefined : candidate;
	}

	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		dragDepth = 0;
		if (disabled) return;
		take(event.dataTransfer?.files?.[0]);
	}

	function clear(): void {
		file = undefined;
		rejection = '';
		// Without this the same file cannot be picked again: the input keeps its value, so
		// re-selecting it fires no change event.
		if (input) input.value = '';
	}
</script>

<div class="flex flex-col gap-2">
	{#if file}
		<!-- Once a file is chosen the zone becomes a statement about it, not an invitation:
		     a drop target that still says "drag it here" beside a filename reads as unset. -->
		<div class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
			<FileIcon class="size-4 shrink-0 text-muted-foreground" />
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-sm font-medium">{file.name}</span>
				<span class="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Remove {file.name}"
				{disabled}
				onclick={clear}
			>
				<X />
			</Button>
		</div>
	{:else}
		<!-- A label rather than a button so the native input stays the thing being clicked:
		     that keeps keyboard and screen-reader behaviour the platform's, and the base
		     layer already gives a file-input label its pointer. -->
		<Label
			class="tactile flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center {dragging
				? 'border-brand bg-brand/5'
				: 'border-border hover:border-muted-foreground/40'} {disabled
				? 'pointer-events-none opacity-50'
				: ''}"
			ondragenter={(event) => {
				event.preventDefault();
				dragDepth += 1;
			}}
			ondragover={(event) => event.preventDefault()}
			ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
			ondrop={handleDrop}
		>
			<Archive class="size-5 text-muted-foreground/60" />
			<span class="text-sm">{label}</span>
			{#if hint}<span class="text-xs text-muted-foreground">{hint}</span>{/if}
			<Input
				bind:ref={input}
				type="file"
				class="sr-only"
				{accept}
				{disabled}
				onchange={(event) => take(event.currentTarget.files?.[0])}
			/>
		</Label>
	{/if}
	{#if rejection}<p class="text-xs text-destructive">{rejection}</p>{/if}
</div>
