<script lang="ts">
	import { getBoundProp, type BaseComponentProps } from '@json-render/svelte';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';
	import type { JsonValue, WidgetDataTableColumn } from '$lib/models/widgets';
	import {
		emptyRow,
		typedNumber,
		withCell,
		withoutRow,
		type DataTableRow
	} from '../tables/data-table-rows';

	let {
		props,
		bindings
	}: BaseComponentProps<{
		rows: readonly DataTableRow[];
		columns: readonly WidgetDataTableColumn[];
		addLabel?: string | null;
		removable?: boolean | null;
		footer?: { readonly [key: string]: string | number | null } | null;
		empty?: string | null;
	}> = $props();

	// The whole list is one binding: each edit writes the list back with one cell changed, and the
	// view's diff turns that into a patch of that cell alone.
	const bound = getBoundProp<readonly DataTableRow[]>(
		() => props.rows,
		() => bindings?.rows
	);
	const rows = $derived(Array.isArray(bound.current) ? bound.current : []);
	const write = (next: readonly DataTableRow[]) => (bound.current = next);
	const set = (index: number, key: string, value: JsonValue) =>
		write(withCell(rows, index, key, value));

	const text = (value: JsonValue | undefined): string =>
		value === undefined || value === null || typeof value === 'object' ? '' : String(value);
	const optionLabel = (column: Extract<WidgetDataTableColumn, { kind: 'select' }>, value: string) =>
		column.options.find((option) => option.value === value)?.label ?? 'Choose';
	const columnCount = $derived(props.columns.length + (props.removable ? 1 : 0));
</script>

<div data-slot="widget-data-table" class="flex flex-col gap-2">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				{#each props.columns as column (column.key)}
					<Table.Head>{column.label}</Table.Head>
				{/each}
				{#if props.removable}<Table.Head><span class="sr-only">Remove</span></Table.Head>{/if}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row, index (index)}
				<Table.Row>
					{#each props.columns as column (column.key)}
						{@const name = `${column.label}, row ${index + 1}`}
						<Table.Cell class="py-1">
							{#if column.kind === 'checkbox'}
								<Checkbox
									aria-label={name}
									checked={row[column.key] === true}
									onCheckedChange={(checked) => set(index, column.key, checked === true)}
								/>
							{:else if column.kind === 'select'}
								<Select.Root
									type="single"
									value={text(row[column.key])}
									onValueChange={(next) => set(index, column.key, next)}
								>
									<Select.Trigger size="sm" class="w-full min-w-28" aria-label={name}>
										{optionLabel(column, text(row[column.key]))}
									</Select.Trigger>
									<Select.Content>
										{#each column.options as option (option.value)}
											<Select.Item value={option.value}>{option.label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{:else if column.kind === 'number'}
								<Input
									type="number"
									inputmode="decimal"
									class="h-8 min-w-20 text-right tabular-nums"
									aria-label={name}
									value={text(row[column.key])}
									oninput={(event) => {
										const value = typedNumber(event.currentTarget.value);
										if (value !== undefined) set(index, column.key, value);
									}}
								/>
							{:else}
								<Input
									class="h-8 min-w-32"
									aria-label={name}
									value={text(row[column.key])}
									oninput={(event) => set(index, column.key, event.currentTarget.value)}
								/>
							{/if}
						</Table.Cell>
					{/each}
					{#if props.removable}
						<Table.Cell class="w-0 py-1">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove row ${index + 1}`}
								onclick={() => write(withoutRow(rows, index))}
							>
								<Icon.Trash />
							</Button>
						</Table.Cell>
					{/if}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={columnCount} class="text-muted-foreground">
						{props.empty ?? 'Nothing here yet.'}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
		{#if props.footer}
			<Table.Footer>
				<Table.Row>
					{#each props.columns as column (column.key)}
						<Table.Cell
							class={column.kind === 'number'
								? 'text-right font-medium tabular-nums'
								: 'font-medium'}
						>
							{text(props.footer[column.key])}
						</Table.Cell>
					{/each}
					{#if props.removable}<Table.Cell></Table.Cell>{/if}
				</Table.Row>
			</Table.Footer>
		{/if}
	</Table.Root>
	{#if props.addLabel}
		<Button
			variant="outline"
			size="sm"
			class="self-start"
			onclick={() => write([...rows, emptyRow(props.columns)])}
		>
			<Icon.Plus />
			{props.addLabel}
		</Button>
	{/if}
</div>
