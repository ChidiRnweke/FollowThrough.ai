import { defineCatalog } from '@json-render/core';
import { defineRegistry, schema } from '@json-render/svelte';
import type { Component } from 'svelte';
import { widgetCatalog, type WidgetComponentName } from '$lib/models/widgets';
import WidgetCard from './elements/widget-card.svelte';
import WidgetCheckbox from './elements/widget-checkbox.svelte';
import WidgetHeading from './elements/widget-heading.svelte';
import WidgetMetric from './elements/widget-metric.svelte';
import WidgetProgress from './elements/widget-progress.svelte';
import WidgetStack from './elements/widget-stack.svelte';
import WidgetText from './elements/widget-text.svelte';
import WidgetTextInput from './elements/widget-text-input.svelte';
import WidgetNumberInput from './elements/widget-number-input.svelte';
import WidgetSelect from './elements/widget-select.svelte';
import WidgetTable from './elements/widget-table.svelte';
import WidgetBadge from './elements/widget-badge.svelte';
import WidgetDivider from './elements/widget-divider.svelte';
import WidgetButton from './elements/widget-button.svelte';
import WidgetLineChart from './elements/widget-line-chart.svelte';
import WidgetAreaChart from './elements/widget-area-chart.svelte';
import WidgetBarChart from './elements/widget-bar-chart.svelte';
import WidgetDataTable from './elements/widget-data-table.svelte';
import WidgetGrid from './elements/widget-grid.svelte';
import WidgetSlider from './elements/widget-slider.svelte';

/**
 * The renderer side of the catalog: one Svelte component per catalog entry, built on our own
 * primitives. `satisfies` keeps the two lists in step: a catalog entry without a
 * component, or a component the catalog does not name, fails the type check.
 */
const components = {
	Stack: WidgetStack,
	Grid: WidgetGrid,
	Card: WidgetCard,
	Heading: WidgetHeading,
	Text: WidgetText,
	Checkbox: WidgetCheckbox,
	Progress: WidgetProgress,
	TextInput: WidgetTextInput,
	NumberInput: WidgetNumberInput,
	Slider: WidgetSlider,
	Select: WidgetSelect,
	Table: WidgetTable,
	DataTable: WidgetDataTable,
	Badge: WidgetBadge,
	Button: WidgetButton,
	LineChart: WidgetLineChart,
	AreaChart: WidgetAreaChart,
	BarChart: WidgetBarChart,
	Divider: WidgetDivider,
	Metric: WidgetMetric
} satisfies Record<WidgetComponentName, Component<never>>;

/** json-render wants mutable slot lists; ours are frozen values in the model. */
const catalogComponents = Object.fromEntries(
	Object.entries(widgetCatalog.components).map(([name, definition]) => [
		name,
		{ ...definition, slots: [...definition.slots] }
	])
);

export const { registry: widgetRegistry } = defineRegistry(
	defineCatalog(schema, { components: catalogComponents, actions: {} }),
	{ components }
);
