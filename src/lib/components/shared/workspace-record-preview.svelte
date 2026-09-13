<script lang="ts">
	import type { WorkspaceRecord } from '$lib/models/workspace-records';
	import { NoteVersionDiff } from '$lib/components/notes';
	import { DiagramDocumentPreview } from '$lib/components/diagrams';
	import { reviewFieldLabels } from '$lib/models/workspace-write-review';
	let {
		label,
		record,
		absent = 'No item',
		baseline = null
	}: {
		label: string;
		record: WorkspaceRecord | null;
		absent?: string;
		baseline?: WorkspaceRecord | null;
	} = $props();
</script>

<section aria-label={label} class="min-w-0 space-y-3">
	<h3 class="border-b pb-2 text-sm font-medium">{label}</h3>
	{#if !record}<p>{absent}</p>
	{:else if record.type === 'notes'}
		<NoteVersionDiff
			layout="candidate"
			frame="bare"
			showCounts={false}
			compact
			base={baseline?.type === 'notes' ? baseline.value.document : record.value.document}
			candidate={record.value.document}
			baseLabel={label}
			candidateLabel={label}
			baseTitle={baseline?.type === 'notes' ? baseline.value.title : record.value.title}
			candidateTitle={record.value.title}
		/>
	{:else if record.type === 'diagrams'}
		<p>{record.value.title}</p>
		<DiagramDocumentPreview source={record.value.source} title={record.value.title} />
	{:else}
		<dl class="space-y-3 text-sm">
			{#each Object.entries(record.value).filter(([field, value]) => reviewFieldLabels[field] && value !== undefined && value !== null) as [field, value] (field)}
				<div
					class={baseline &&
					baseline.type === record.type &&
					JSON.stringify(Object.entries(baseline.value).find(([key]) => key === field)?.[1]) !==
						JSON.stringify(value)
						? 'rounded-md bg-primary/10 p-2'
						: ''}
				>
					<dt class="font-medium">{reviewFieldLabels[field]}</dt>
					<dd class="whitespace-pre-wrap break-words text-muted-foreground">
						{typeof value === 'string'
							? value
							: typeof value === 'boolean'
								? value
									? 'Yes'
									: 'No'
								: JSON.stringify(value, null, 2)}
					</dd>
				</div>
			{/each}
		</dl>
	{/if}
</section>
