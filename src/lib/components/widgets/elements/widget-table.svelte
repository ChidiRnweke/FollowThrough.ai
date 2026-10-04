<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import * as Table from '$lib/components/ui/table';
	import type { JsonValue } from '$lib/models/widgets';

	let {
		props
	}: BaseComponentProps<{
		columns: readonly { key: string; label: string }[];
		rows: readonly { readonly [key: string]: JsonValue }[];
		empty?: string | null;
	}> = $props();

	// A cell shows text; a nested value is not something a table cell can show honestly.
	const cell = (value: JsonValue | undefined): string =>
		value === undefined || value === null ? '' : typeof value === 'object' ? '…' : String(value);
	const rows = $derived(Array.isArray(props.rows) ? props.rows : []);
</script>

<div data-slot="widget-table">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				{#each props.columns as column (column.key)}
					<Table.Head>{column.label}</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row, index (index)}
				<Table.Row>
					{#each props.columns as column (column.key)}
						<Table.Cell>{cell(row[column.key])}</Table.Cell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={props.columns.length} class="text-muted-foreground">
						{props.empty ?? 'Nothing here yet.'}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
