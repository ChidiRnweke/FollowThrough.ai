<script lang="ts">
	import { diffLines } from 'diff';
	import { cn } from '$lib/utils';

	let {
		base,
		candidate,
		label
	}: {
		base: string;
		candidate: string;
		label: string;
	} = $props();

	const linesFor = (before: string, after: string) =>
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

	const lineClasses = {
		added: 'bg-primary/10 text-primary',
		removed: 'bg-destructive/10 text-destructive',
		context: 'text-muted-foreground'
	} as const;
</script>

<section class="flex min-h-0 flex-col gap-2" aria-label={label}>
	<p class="text-xs text-muted-foreground">Changes from the version this edit started from</p>
	<pre
		class="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed"><code
			>{#each linesFor(base, candidate) as line, index (`${line.type}-${index}`)}<span
					class={cn('block px-2', lineClasses[line.type])}
					><span aria-hidden="true"
						>{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span
					>
{line.content || ' '}</span
				>{/each}</code
		></pre>
</section>
