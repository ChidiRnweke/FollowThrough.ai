<script lang="ts">
	import { diffLines } from 'diff';
	import { SvelteSet } from 'svelte/reactivity';
	import { cn } from '$lib/utils';

	let {
		base,
		candidate,
		label,
		compact = false
	}: {
		base: string;
		candidate: string;
		label: string;
		compact?: boolean;
	} = $props();

	const allLinesFor = (before: string, after: string) =>
		diffLines(before, after).flatMap((change) =>
			change.value
				.replace(/\n$/, '')
				.split('\n')
				.map((content) => ({
					content,
					type: change.added
						? ('added' as const)
						: change.removed
							? ('removed' as const)
							: ('context' as const)
				}))
		);

	function linesFor(before: string, after: string) {
		const lines = allLinesFor(before, after);
		if (!compact) return lines;
		const kept = new SvelteSet<number>();
		for (const [index, line] of lines.entries()) {
			if (line.type === 'context') continue;
			kept.add(index);
			if (index > 0) kept.add(index - 1);
			if (index + 1 < lines.length) kept.add(index + 1);
		}
		const result: (typeof lines)[number][] = [];
		let omitted = false;
		for (const [index, line] of lines.entries()) {
			if (kept.has(index)) {
				if (omitted) result.push({ type: 'context', content: '…' });
				result.push(line);
				omitted = false;
			} else omitted = true;
		}
		if (omitted) result.push({ type: 'context', content: '…' });
		return result;
	}

	const lineClasses = {
		added: 'bg-primary/10 text-primary',
		removed: 'bg-destructive/10 text-destructive',
		context: 'text-muted-foreground'
	} as const;
</script>

<section class="flex min-h-0 flex-col gap-2" aria-label={label}>
	<p class="text-xs text-muted-foreground">Changes from the version this edit started from</p>
	<pre
		class={cn(
			'overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed',
			compact ? 'max-h-48' : 'max-h-96'
		)}><code
			>{#each linesFor(base, candidate) as line, index (`${line.type}-${index}`)}<span
					class={cn('block px-2', lineClasses[line.type])}
					><span aria-hidden="true"
						>{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span
					>
{line.content || ' '}</span
				>{/each}</code
		></pre>
</section>
