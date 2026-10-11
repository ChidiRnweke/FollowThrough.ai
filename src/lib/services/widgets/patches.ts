import type { DateTime } from '$lib/models/workspace';
import type {
	Widget,
	WidgetChange,
	WidgetContent,
	WidgetPartsRebase,
	WidgetData,
	JsonValue,
	JsonPatch,
	JsonPatchOperation,
	WidgetCandidate,
	WidgetProposal
} from '$lib/models/widgets';
type JsonObject = { readonly [key: string]: JsonValue };

const isObject = (value: JsonValue): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

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

const pointerSegment = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** Key order does not distinguish two JSON objects. */
const canonical = (value: JsonValue): JsonValue =>
	Array.isArray(value)
		? value.map(canonical)
		: isObject(value)
			? Object.fromEntries(
					Object.keys(value)
						.sort()
						.map((key) => [key, canonical(value[key]!)])
				)
			: value;

const sameJson = (left: JsonValue, right: JsonValue): boolean =>
	JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

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
 * The smallest patch from one JSON object to the next, at the deepest changed field. Ticking one
 * checkbox produces one `replace` of that item's flag, not a new data object. An array whose
 * length changed is replaced whole, so an index shift is never mistaken for an item edit.
 */
const diffJsonObject = (before: JsonObject, after: JsonObject): JsonPatch =>
	diffObject('', before, after);

const diffWidgetData = (before: WidgetData, after: WidgetData): JsonPatch =>
	diffJsonObject(before, after);

/** What a replayed local edit keeps of the widget parts the generic field replay cannot merge. */

/**
 * Replay a local widget onto a newer one (ADR 0042), merging `data` path by path. The local data
 * change and the remote one merge when they commute: the local patch applied to the remote data
 * equals the remote patch applied to the local data. Edits to different items always commute;
 * two edits to one value, or a list one side reordered, do not, and go to review. Each revision
 * is the newer one, advanced once if the local edit changed that part, as the server will.
 */
const rebaseWidgetParts = (observed: Widget, local: Widget, onto: Widget): WidgetPartsRebase => {
	const layoutRevision = onto.layoutRevision + (sameJson(observed.layout, local.layout) ? 0 : 1);
	const localPatch = diffWidgetData(observed.data, local.data);
	if (localPatch.length === 0)
		return { data: onto.data, dataRevision: onto.dataRevision, layoutRevision, overlaps: false };
	const remotePatch = diffWidgetData(observed.data, onto.data);
	const dataRevision = onto.dataRevision + 1;
	if (remotePatch.length === 0)
		return { data: local.data, dataRevision, layoutRevision, overlaps: false };
	const merged = applyJsonPatch(onto.data, localPatch);
	const alternate = applyJsonPatch(local.data, remotePatch);
	if (
		merged.kind === 'patched' &&
		alternate.kind === 'patched' &&
		isObject(merged.value) &&
		sameJson(merged.value, alternate.value)
	)
		return { data: merged.value, dataRevision, layoutRevision, overlaps: false };
	return { data: local.data, dataRevision, layoutRevision, overlaps: true };
};

/** A widget's title, layout and data as someone edited them, before they become changes. */

/**
 * The changes that turn `widget` into `next`, smallest first: a rename, and one layout, data or
 * combined change. Layout and data that both changed go as one `parts` change, because a new
 * layout can need the new data (a list and its array) and only the pair is valid.
 */
const widgetChangesBetween = (widget: Widget, next: WidgetContent): readonly WidgetChange[] => {
	const title = next.title.trim();
	const layout = diffJsonObject(widget.layout, next.layout);
	const data = diffWidgetData(widget.data, next.data);
	const rename: readonly WidgetChange[] =
		title && title !== widget.title ? [{ kind: 'rename', title }] : [];
	if (layout.length > 0 && data.length > 0) return [...rename, { kind: 'parts', layout, data }];
	if (layout.length > 0) return [...rename, { kind: 'layout', patch: layout }];
	if (data.length > 0) return [...rename, { kind: 'data', patch: data }];
	return rename;
};

export interface IWidgetPatchService {
	propose(
		widget: Widget,
		change: Exclude<WidgetChange, { kind: 'parts' }>,
		catalogVersion: number,
		now: DateTime
	): WidgetProposal;
	changesBetween(widget: Widget, next: WidgetContent): readonly WidgetChange[];
	diffData(before: WidgetData, after: WidgetData): JsonPatch;
	rebaseParts(observed: Widget, local: Widget, onto: Widget): WidgetPartsRebase;
}

/** Patch mechanics and comparison. Candidates must pass the write-input reader before use. */
export class WidgetPatchService implements IWidgetPatchService {
	propose(
		widget: Widget,
		change: Exclude<WidgetChange, { kind: 'parts' }>,
		catalogVersion: number,
		now: DateTime
	): WidgetProposal {
		if (change.kind === 'rename')
			return {
				kind: 'candidate',
				change: 'rename',
				widget: { ...widget, title: change.title.trim(), updatedAt: now }
			};
		let data: JsonValue = widget.data;
		let layout: JsonValue = widget.layout;
		if (change.kind === 'data') {
			const result = applyJsonPatch(data, change.patch);
			if (result.kind === 'failure')
				return {
					kind: 'invalid',
					issues: [{ path: `/data${result.path}`, message: result.message }]
				};
			data = result.value;
		}
		if (change.kind === 'layout') {
			const result = applyJsonPatch(layout, change.patch);
			if (result.kind === 'failure')
				return {
					kind: 'invalid',
					issues: [{ path: `/layout${result.path}`, message: result.message }]
				};
			layout = result.value;
		}
		const candidate: WidgetCandidate = {
			...widget,
			data,
			layout,
			dataRevision: widget.dataRevision + (change.kind === 'layout' ? 0 : 1),
			layoutRevision: widget.layoutRevision + (change.kind === 'data' ? 0 : 1),
			catalogVersion: change.kind === 'data' ? widget.catalogVersion : catalogVersion,
			updatedAt: now
		};
		return { kind: 'candidate', change: change.kind, widget: candidate };
	}
	changesBetween(widget: Widget, next: WidgetContent): readonly WidgetChange[] {
		return widgetChangesBetween(widget, next);
	}
	diffData(before: WidgetData, after: WidgetData): JsonPatch {
		return diffWidgetData(before, after);
	}
	rebaseParts(observed: Widget, local: Widget, onto: Widget): WidgetPartsRebase {
		return rebaseWidgetParts(observed, local, onto);
	}
}
