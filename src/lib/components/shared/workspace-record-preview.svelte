<script lang="ts">
	import { cn } from '$lib/utils';
	import type { WorkspaceRecord } from '$lib/models/workspace-records';
	import { NoteVersionDiff } from '$lib/components/notes';
	import { DiagramDocumentPreview } from '$lib/components/diagrams';
	import {
		SYNC_GAP_BOND,
		SYNC_GAP_ITEM,
		SYNC_LABEL,
		SYNC_VALUE,
		SYNC_EVIDENCE
	} from './sync-review';
	import { reviewFieldLabels } from '$lib/models/workspace-write-review';
	import { visibleReviewFields } from '$lib/services/workspace/write-review';
	let {
		label,
		record,
		absent = 'No item',
		baseline = null,
		showHeading = true,
		title = '',
		headerAction
	}: {
		label: string;
		record: WorkspaceRecord | null;
		absent?: string;
		baseline?: WorkspaceRecord | null;
		showHeading?: boolean;
		title?: string;
		headerAction?: import('svelte').Snippet;
	} = $props();
</script>

<section aria-label={label} class={cn('min-w-0 flex flex-col', SYNC_GAP_ITEM)}>
	{#if showHeading}<div class="flex min-h-7 items-center justify-between">
			<h3 class="eyebrow">{label}</h3>
			{#if headerAction}{@render headerAction()}{/if}
		</div>{/if}
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
			titles={{
				base: baseline?.type === 'notes' ? baseline.value.title : record.value.title,
				candidate: record.value.title
			}}
		/>
	{:else if record.type === 'diagrams'}
		<p>{record.value.title}</p>
		<DiagramDocumentPreview source={record.value.source} title={record.value.title} />
	{:else}
		<dl class={cn('flex flex-col', SYNC_GAP_ITEM)}>
			{#each visibleReviewFields(record, title) as [field, value] (field)}
				<div
					class={cn(
						'flex flex-col',
						SYNC_GAP_BOND,
						baseline &&
							baseline.type === record.type &&
							JSON.stringify(Object.entries(baseline.value).find(([key]) => key === field)?.[1]) !==
								JSON.stringify(value)
							? SYNC_EVIDENCE
							: ''
					)}
				>
					<dt class={SYNC_LABEL}>{reviewFieldLabels[field]}</dt>
					<dd class={cn('whitespace-pre-wrap break-words', SYNC_VALUE)}>
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
