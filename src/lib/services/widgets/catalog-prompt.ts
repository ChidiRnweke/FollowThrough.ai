import { z } from 'zod';
import { formulaFunctions } from '$lib/models/widget-formulas';
import {
	widgetActions,
	widgetSourceKinds,
	widgetTemplates,
	type WidgetCatalog
} from '$lib/models/widgets';

/** A component's props as compact JSON Schema, which is the form a model reads most reliably. */
const propsSchema = (props: z.ZodObject): string =>
	JSON.stringify(z.toJSONSchema(props, { io: 'input', unrepresentable: 'any' }));

/**
 * What an agent needs to write a widget this catalog accepts (ADR 0043). It is generated from the
 * catalog, so it cannot describe a component, prop, expression or action the rule would refuse.
 * json-render's own `catalog.prompt()` is not used: it describes custom actions, `watch` and
 * other features this catalog leaves out on purpose.
 */
export const widgetCatalogPrompt = (catalog: WidgetCatalog): string =>
	[
		`# Widget catalog, version ${catalog.version}`,
		'',
		'A widget has a title, a layout and data. The layout is a flat element map: `{ "root": "<key>", "elements": { "<key>": { "type", "props", "children" } } }`. Every element needs `children`, an array of element keys; a leaf uses `[]`. Keys use letters, digits, `-` and `_`.',
		'',
		'The data is a JSON object. Props read it with expressions:',
		'- `{ "$state": "/path" }` reads a value by JSON Pointer.',
		'- `{ "$bindState": "/path" }` reads a value and lets a control write it back. Use it on `checked` and `value`.',
		'- An element with `"repeat": { "statePath": "/items", "key": "id" }` renders its children once per array item. Inside, `{ "$item": "field" }` reads the item and `{ "$bindItem": "field" }` binds it; `{ "$index": true }` is the position.',
		'- `{ "$template": "Hello ${/name}" }` fills a string from state.',
		'',
		'`visible` shows an element only while a condition holds: `{ "$state": "/path", "eq": "x" }`, `{ "$item": "field", "neq": 0 }`, with `gt`, `gte`, `lt`, `lte`, `not: true`, a list (all must hold), `{ "$and": [...] }` or `{ "$or": [...] }`.',
		'',
		`Element \`on\` bindings may use only these actions: ${widgetActions.map((action) => `\`${action}\``).join(', ')}.`,
		'',
		'## Formulas',
		'',
		'Values worked out from the data go in the layout\'s optional `derived` map: `"derived": { "<name>": "<formula>" }`. Each result is read at `/derived/<name>` with `$state`, never bound. Formulas update as the data changes and are never saved in the data, which must not have a `derived` key.',
		'',
		'- `@/path` reads the data by JSON Pointer; `@/derived/<name>` reads another formula. Formulas must not read each other in a circle.',
		'- Numbers, `"text"`, `true`, `false`, `null`, lists `[a, b]` and records `{ field: value }`. `x.field` reads a record field.',
		'- `+ - * / % ^`, `== != < <= > >=`, `and`, `or`, `not`. `+` joins text when either side is text.',
		`- Functions: ${Object.values(formulaFunctions)
			.map((definition) => definition.usage)
			.join('; ')}.`,
		'- Inside a function body the names are fixed: `item` is the current element and `i` is its position, a number. You cannot name your own parameter, so write `item.amount`, never `x.amount` or `i.amount`. A `map` or `filter` inside another body rebinds `item` to the inner element; totals per group are `map(group(@/rows, "category"), { category: item.key, amount: sum(map(item.items, item.amount)) })`.',
		'- A failed formula (division by zero, a missing number) reads as `null` and the widget says why.',
		'',
		'## Workspace sources',
		'',
		'A dashboard reads the user\'s own work in the widget\'s project through the layout\'s optional `sources` map: `"sources": { "<name>": { "kind": "<kind>" } }`. The rows are at `/sources/<name>`, are never saved, and stay current as the work changes. Count, filter and group them with formulas. Nothing outside the workspace can be read.',
		'',
		...Object.entries(widgetSourceKinds).map(
			([kind, definition]) =>
				`- \`${kind}\`: ${definition.description} Each row has ${definition.fields}.`
		),
		'',
		'## Components',
		'',
		...Object.entries(catalog.components).flatMap(([name, definition]) => [
			`### ${name}`,
			definition.description,
			definition.slots.length > 0 ? 'Renders its children.' : 'A leaf: `children` must be `[]`.',
			`Props: ${propsSchema(definition.props)}`,
			''
		]),
		'## Example: a checklist',
		'',
		'```json',
		JSON.stringify(
			{
				title: widgetTemplates.checklist.title,
				layout: widgetTemplates.checklist.layout,
				data: widgetTemplates.checklist.data
			},
			null,
			1
		),
		'```',
		'',
		'## Example: formulas',
		'',
		'```json',
		JSON.stringify({ derived: widgetTemplates.savings.layout.derived }, null, 1),
		'```'
	].join('\n');
