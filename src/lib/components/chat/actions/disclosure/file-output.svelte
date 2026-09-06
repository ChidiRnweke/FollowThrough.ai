<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { canOpenEntity, openEntity, entityActionLabel } from '../open-entity';
	import type { EntityRef, FileOutputLine } from '$lib/components/agent';
	let { headline, lines }: { headline?: string; lines: readonly FileOutputLine[] } = $props();
	const groups = $derived.by(() => {
		const result: { source: EntityRef | undefined; lines: FileOutputLine[] }[] = [];
		for (const line of lines) {
			const source = line.source;
			const group = result.find((candidate) =>
				source
					? candidate.source?.kind === source.kind &&
						(source.id
							? candidate.source.id === source.id
							: candidate.source.title === source.title)
					: !candidate.source
			);
			if (group) group.lines.push(line);
			else result.push({ source, lines: [line] });
		}
		return result;
	});
</script>

<div class="flex flex-col gap-1">
	{#if headline}<p>{headline}</p>{/if}
	{#if lines.length > 0}
		<div class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-muted/40 px-2 py-1.5">
			{#each groups as group, index (index)}
				{#if group.source}
					{@const source = group.source}
					{#if canOpenEntity(source)}
						<Button
							variant="ghost"
							size="sm"
							class="max-w-full justify-start truncate"
							aria-label={entityActionLabel(source)}
							onclick={() => openEntity(source)}>{source.title}</Button
						>
					{:else}<p class="text-xs text-muted-foreground">{source.title}</p>{/if}
				{/if}
				<ul class="flex flex-col gap-0.5 font-mono text-xs">
					{#each group.lines as line, lineIndex (lineIndex)}
						<li class="flex gap-2">
							{#if line.lineNumber !== undefined || (!group.source && line.context !== undefined)}
								<span class="shrink-0 text-muted-foreground select-none"
									>{line.lineNumber ?? line.context}</span
								>
							{/if}
							<span class="min-w-0 break-words whitespace-pre-wrap text-foreground/80"
								>{line.text}</span
							>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	{/if}
</div>
