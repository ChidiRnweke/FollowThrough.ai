import { validateSpec } from '@json-render/core';
import type { z } from 'zod';
import type { DateTime } from '$lib/models/workspace';
import {
	widgetDataSchema,
	widgetLayoutSchema,
	type JsonPatch,
	type JsonPatchOperation,
	type JsonValue,
	type Widget,
	type WidgetCatalog,
	type WidgetCreation,
	type WidgetData,
	type WidgetDraft,
	type WidgetEdit,
	type WidgetEditResult,
	type WidgetIssue,
	type WidgetLayout
} from '$lib/models/widgets';

type JsonObject = { readonly [key: string]: JsonValue };

type Patched<T> =
	| { readonly kind: 'patched'; readonly value: T }
	| { readonly kind: 'invalid'; readonly issues: readonly WidgetIssue[] };

const isObject = (value: JsonValue): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const zodIssues = (base: string, error: z.ZodError): readonly WidgetIssue[] =>
	error.issues.map((issue) => ({
		path: [base, ...issue.path.map(String)].join('/'),
		message: issue.message
	}));

type PatchResult =
	| { readonly kind: 'patched'; readonly value: JsonValue }
	| { readonly kind: 'failure'; readonly path: string; readonly message: string };

type Step =
	| { readonly kind: 'ok'; readonly value: JsonValue }
	| { readonly kind: 'failure'; readonly message: string };

const tokens = (pointer: string): readonly string[] =>
	pointer === ''
		? []
		: pointer
				.slice(1)
				.split('/')
				.map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));

const arrayIndex = (token: string, length: number, allowEnd: boolean): number | undefined => {
	if (allowEnd && token === '-') return length;
	if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;
	const index = Number(token);
	return index < length || (allowEnd && index === length) ? index : undefined;
};

const read = (document: JsonValue, path: readonly string[]): JsonValue | undefined => {
	let current: JsonValue | undefined = document;
	for (const token of path) {
		if (current === undefined) return undefined;
		if (Array.isArray(current)) {
			const index = arrayIndex(token, current.length, false);
			current = index === undefined ? undefined : current[index];
		} else if (isObject(current)) {
			current = Object.hasOwn(current, token) ? current[token] : undefined;
		} else return undefined;
	}
	return current;
};

/** Rebuild the containers along `path`, letting `change` decide the last one. */
const update = (
	document: JsonValue,
	path: readonly string[],
	change: (container: JsonValue, token: string) => Step
): Step => {
	const [token, ...rest] = path;
	if (token === undefined)
		return { kind: 'failure', message: 'The root cannot be changed this way' };
	if (rest.length === 0) return change(document, token);
	const child = read(document, [token]);
	if (child === undefined) return { kind: 'failure', message: `Nothing at ${token}` };
	const next = update(child, rest, change);
	if (next.kind === 'failure') return next;
	if (Array.isArray(document)) {
		const index = Number(token);
		return { kind: 'ok', value: document.map((item, at) => (at === index ? next.value : item)) };
	}
	return isObject(document)
		? { kind: 'ok', value: { ...document, [token]: next.value } }
		: { kind: 'failure', message: `${token} is inside a value that has no fields` };
};

const add = (document: JsonValue, path: readonly string[], value: JsonValue): Step =>
	path.length === 0
		? { kind: 'ok', value }
		: update(document, path, (container, token) => {
				if (Array.isArray(container)) {
					const index = arrayIndex(token, container.length, true);
					if (index === undefined)
						return { kind: 'failure', message: `Index ${token} is out of range` };
					return {
						kind: 'ok',
						value: [...container.slice(0, index), value, ...container.slice(index)]
					};
				}
				return isObject(container)
					? { kind: 'ok', value: { ...container, [token]: value } }
					: { kind: 'failure', message: `Cannot add ${token} to a value that has no fields` };
			});

const remove = (document: JsonValue, path: readonly string[]): Step =>
	update(document, path, (container, token) => {
		if (Array.isArray(container)) {
			const index = arrayIndex(token, container.length, false);
			if (index === undefined)
				return { kind: 'failure', message: `Index ${token} is out of range` };
			return { kind: 'ok', value: container.filter((_, at) => at !== index) };
		}
		if (!isObject(container) || !Object.hasOwn(container, token))
			return { kind: 'failure', message: `Nothing at ${token}` };
		return {
			kind: 'ok',
			value: Object.fromEntries(Object.entries(container).filter(([key]) => key !== token))
		};
	});

const replace = (document: JsonValue, path: readonly string[], value: JsonValue): Step => {
	if (path.length === 0) return { kind: 'ok', value };
	if (read(document, path) === undefined) return { kind: 'failure', message: 'Nothing to replace' };
	return update(document, path, (container, token) => {
		if (Array.isArray(container)) {
			const index = Number(token);
			return { kind: 'ok', value: container.map((item, at) => (at === index ? value : item)) };
		}
		return isObject(container)
			? { kind: 'ok', value: { ...container, [token]: value } }
			: { kind: 'failure', message: `Cannot replace ${token}` };
	});
};

const apply = (document: JsonValue, operation: JsonPatchOperation): Step => {
	const path = tokens(operation.path);
	switch (operation.op) {
		case 'add':
			return add(document, path, operation.value);
		case 'replace':
			return replace(document, path, operation.value);
		case 'remove':
			return remove(document, path);
		case 'test': {
			const current = read(document, path);
			return current !== undefined && JSON.stringify(current) === JSON.stringify(operation.value)
				? { kind: 'ok', value: document }
				: { kind: 'failure', message: 'The test value does not match' };
		}
		case 'copy':
		case 'move': {
			const from = tokens(operation.from);
			const value = read(document, from);
			if (value === undefined) return { kind: 'failure', message: `Nothing at ${operation.from}` };
			if (operation.op === 'copy') return add(document, path, value);
			const removed = remove(document, from);
			return removed.kind === 'failure' ? removed : add(removed.value, path, value);
		}
	}
};

/**
 * Apply an RFC 6902 patch without changing `document`. Either every operation applies or the
 * result names the first one that could not, so a partly applied patch is never returned.
 */
const applyJsonPatch = (document: JsonValue, patch: JsonPatch): PatchResult => {
	let current = document;
	for (const [index, operation] of patch.entries()) {
		const step = apply(current, operation);
		if (step.kind === 'failure')
			return {
				kind: 'failure',
				path: operation.path,
				message: `Operation ${index}: ${step.message}`
			};
		current = step.value;
	}
	return { kind: 'patched', value: current };
};

/**
 * A patch output is not narrow until it is checked: an operation can replace an element with a
 * number. Checking it against the part's schema is this rule's job, not a boundary parse of
 * outside input; the input edit was parsed where it arrived.
 */
const patchPart = <T>(
	value: JsonValue,
	patch: JsonPatch,
	part: 'data' | 'layout',
	schema: z.ZodType<T>
): Patched<T> => {
	const patched = applyJsonPatch(value, patch);
	if (patched.kind === 'failure')
		return {
			kind: 'invalid',
			issues: [{ path: `/${part}${patched.path}`, message: patched.message }]
		};
	const result = schema.safeParse(patched.value);
	return result.success
		? { kind: 'patched', value: result.data }
		: { kind: 'invalid', issues: zodIssues(`/${part}`, result.error) };
};

/**
 * Everything the renderer and the catalog require of a layout with its data. Structure comes
 * from json-render; props come from the catalog, because the library checks props only for a
 * catalog with one component.
 */
export const widgetIssues = (
	layout: WidgetLayout,
	data: WidgetData,
	catalog: WidgetCatalog
): readonly WidgetIssue[] => {
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
	return [...structure, ...elements];
};

const checked = (widget: Widget, catalog: WidgetCatalog): WidgetEditResult => {
	const issues = widgetIssues(widget.layout, widget.data, catalog);
	return issues.length > 0 ? { kind: 'invalid', issues } : { kind: 'applied', widget };
};

/** Create a widget from a draft or a template. */
export const createWidget = (
	draft: WidgetDraft,
	creation: WidgetCreation,
	catalog: WidgetCatalog
): WidgetEditResult =>
	checked(
		{
			id: creation.id,
			userId: creation.userId,
			projectId: creation.projectId,
			...(creation.sourceNoteId ? { sourceNoteId: creation.sourceNoteId } : {}),
			title: draft.title.trim(),
			catalogVersion: catalog.version,
			layout: draft.layout,
			layoutRevision: 1,
			data: draft.data,
			dataRevision: 1,
			createdAt: creation.now,
			updatedAt: creation.now
		},
		catalog
	);

/**
 * The one rule for changing a widget (ADR 0043). It checks the revision of the part the edit
 * touches, applies the change to a copy, and validates the result against the catalog. The
 * browser, the server, the agent tools and the approval preview all call it.
 */
export const applyWidgetEdit = (
	widget: Widget,
	edit: WidgetEdit,
	catalog: WidgetCatalog,
	now: DateTime
): WidgetEditResult => {
	switch (edit.kind) {
		case 'data': {
			if (edit.expectedDataRevision !== widget.dataRevision)
				return { kind: 'stale', part: 'data', currentRevision: widget.dataRevision };
			const data = patchPart(widget.data, edit.patch, 'data', widgetDataSchema);
			if (data.kind === 'invalid') return data;
			return checked(
				{ ...widget, data: data.value, dataRevision: widget.dataRevision + 1, updatedAt: now },
				catalog
			);
		}
		case 'layout': {
			if (edit.expectedLayoutRevision !== widget.layoutRevision)
				return { kind: 'stale', part: 'layout', currentRevision: widget.layoutRevision };
			const layout = patchPart(widget.layout, edit.patch, 'layout', widgetLayoutSchema);
			if (layout.kind === 'invalid') return layout;
			return checked(
				{
					...widget,
					layout: layout.value,
					layoutRevision: widget.layoutRevision + 1,
					catalogVersion: catalog.version,
					updatedAt: now
				},
				catalog
			);
		}
		case 'rename':
			return { kind: 'applied', widget: { ...widget, title: edit.title.trim(), updatedAt: now } };
	}
};

const pointerSegment = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

const sameJson = (left: JsonValue, right: JsonValue): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

const diffValue = (path: string, before: JsonValue, after: JsonValue): JsonPatch => {
	if (sameJson(before, after)) return [];
	if (isObject(before) && isObject(after)) return diffObject(path, before, after);
	if (Array.isArray(before) && Array.isArray(after) && before.length === after.length)
		return before.flatMap((item, index) => diffValue(`${path}/${index}`, item, after[index]!));
	return [{ op: 'replace', path, value: after }];
};

const diffObject = (path: string, before: JsonObject, after: JsonObject): JsonPatch => [
	...Object.keys(before)
		.filter((key) => !Object.hasOwn(after, key))
		.map((key) => ({ op: 'remove' as const, path: `${path}/${pointerSegment(key)}` })),
	...Object.entries(after).flatMap(([key, value]) =>
		Object.hasOwn(before, key)
			? diffValue(`${path}/${pointerSegment(key)}`, before[key]!, value)
			: [{ op: 'add' as const, path: `${path}/${pointerSegment(key)}`, value }]
	)
];

/**
 * The smallest data patch from one value to the next, at the deepest changed field. Ticking one
 * checkbox produces one `replace` of that item's flag, not a new data object.
 */
export const diffWidgetData = (before: WidgetData, after: WidgetData): JsonPatch =>
	diffObject('', before, after);
