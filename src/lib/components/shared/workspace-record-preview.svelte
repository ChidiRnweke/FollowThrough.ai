<script lang="ts">
	import type { WorkspaceRecord } from '$lib/models/workspace-records';
	import { NoteVersionDiff } from '$lib/components/notes';
	import { DiagramDocumentPreview } from '$lib/components/diagrams';
	let {
		label,
		record,
		absent = 'No item'
	}: { label: string; record: WorkspaceRecord | null; absent?: string } = $props();
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
			base={record.value.document}
			candidate={record.value.document}
			baseLabel={label}
			candidateLabel={label}
			baseTitle={record.value.title}
			candidateTitle={record.value.title}
		/>
	{:else if record.type === 'diagrams'}
		<p>{record.value.title}</p>
		<DiagramDocumentPreview source={record.value.source} title={record.value.title} />
	{:else}
		<dl class="space-y-3 text-sm">
			{#each Object.entries(record.value).filter(([field]) => !['id', 'userId', 'createdAt', 'updatedAt'].includes(field)) as [field, value] (field)}
				<div>
					<dt class="font-medium capitalize">{field.replace(/([A-Z])/g, ' $1')}</dt>
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
