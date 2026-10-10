import type { WidgetCatalogReader, WidgetCatalogDescription } from '$lib/models/widgets';
import { validateSpec } from '@json-render/core';
import { z } from 'zod';
import {
	widgetDataSchema,
	widgetLayoutSchema,
	type WidgetCandidate,
	type WidgetCandidateReader,
	type WidgetCandidateRead,
	type WidgetCatalog,
	type WidgetIssue
} from '$lib/models/widgets';
const zodIssues = (base: string, error: z.ZodError): readonly WidgetIssue[] =>
	error.issues.map((issue) => ({
		path: [base, ...issue.path.map(String)].join('/'),
		message: issue.message
	}));

/** Shared browser/server write-input adapter. Never imports domain services. */
export class CatalogWidgetCandidateReader implements WidgetCandidateReader, WidgetCatalogReader {
	readCatalog(catalog: WidgetCatalog): WidgetCatalogDescription {
		return {
			version: catalog.version,
			components: Object.fromEntries(
				Object.entries(catalog.components).map(([name, definition]) => [
					name,
					{
						description: definition.description,
						slots: definition.slots,
						propsSchema: JSON.stringify(
							z.toJSONSchema(definition.props, { io: 'input', unrepresentable: 'any' })
						)
					}
				])
			)
		};
	}
	read(candidate: WidgetCandidate, catalog: WidgetCatalog): WidgetCandidateRead {
		const parsedData = widgetDataSchema.safeParse(candidate.data);
		if (!parsedData.success)
			return { kind: 'invalid', issues: zodIssues('/data', parsedData.error) };
		const parsedLayout = widgetLayoutSchema.safeParse(candidate.layout);
		if (!parsedLayout.success)
			return { kind: 'invalid', issues: zodIssues('/layout', parsedLayout.error) };
		const data = parsedData.data;
		const layout = parsedLayout.data;
		const structure = validateSpec({ ...layout, state: data }, { checkOrphans: true })
			.issues.filter((issue) => issue.severity === 'error')
			.map((issue) => ({
				path: issue.elementKey ? `/layout/elements/${issue.elementKey}` : '/layout',
				message: issue.message
			}));
		const elements = Object.entries(layout.elements).flatMap(([key, element]) => {
			const base = `/layout/elements/${key}`;
			const definition = catalog.components[element.type];
			if (!definition)
				return [{ path: `${base}/type`, message: `${element.type} is not in the widget catalog` }];
			const props = definition.props.safeParse(element.props);
			const childIssues =
				definition.slots.length === 0 && element.children.length > 0
					? [{ path: `${base}/children`, message: `${element.type} cannot have children` }]
					: [];
			return [...(props.success ? [] : zodIssues(`${base}/props`, props.error)), ...childIssues];
		});
		return {
			kind: 'read',
			widget: { ...candidate, layout, data },
			issues: [...structure, ...elements]
		};
	}
}
