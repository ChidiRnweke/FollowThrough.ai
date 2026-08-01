<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { FtCheck as Check, FtCopy as Copy } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';

	/**
	 * Read-only. The "Apply to note" action that used to live here kept only the `+`
	 * lines and replaced the whole body with them, so any diff carrying context
	 * truncated the note — and it bypassed the approval gate besides. Targeted edits go
	 * through the agent's `edit_note` tool now.
	 */
	let { diffText }: { diffText: string } = $props();

	let copied = $state(false);

	function parseDiff(diff: string): {
		lines: { type: 'add' | 'remove' | 'context' | 'header'; content: string }[];
	} {
		const lines = diff.split('\n');
		const result: { type: 'add' | 'remove' | 'context' | 'header'; content: string }[] = [];
		for (const line of lines) {
			if (line.startsWith('@@')) {
				result.push({ type: 'header', content: line });
			} else if (line.startsWith('+')) {
				result.push({ type: 'add', content: line });
			} else if (line.startsWith('-')) {
				result.push({ type: 'remove', content: line });
			} else {
				result.push({ type: 'context', content: line });
			}
		}
		return { lines: result };
	}

	const { lines } = $derived(parseDiff(diffText));

	async function copyToClipboard(): Promise<void> {
		await navigator.clipboard.writeText(diffText);
		copied = true;
		toast.success('Diff copied to clipboard');
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="rounded-md border border-border bg-muted/50 overflow-hidden my-2">
	<div class="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border">
		<span class="text-xs font-medium text-muted-foreground">Proposed changes</span>
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon-xs" aria-label="Copy diff" onclick={copyToClipboard}>
				{#if copied}
					<Check class="size-3.5" />
				{:else}
					<Copy class="size-3.5" />
				{/if}
			</Button>
		</div>
	</div>
	<pre class="overflow-x-auto p-3 text-xs font-mono leading-relaxed max-h-80 overflow-y-auto"><code>
			{#each lines as line, index (index)}
				{@const cls =
					line.type === 'add'
						? 'bg-success/15 text-success'
						: line.type === 'remove'
							? 'bg-destructive/15 text-destructive'
							: line.type === 'header'
								? 'text-primary'
								: 'text-muted-foreground'}
				<span class="block px-2 {cls}">{line.content || ' '}</span
				>
			{/each}
		</code></pre>
</div>
