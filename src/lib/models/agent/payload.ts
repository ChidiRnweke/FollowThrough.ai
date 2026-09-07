/**
 * What the wire actually carries.
 *
 * Tool arguments and tool results reach the client two ways, and both are JSON:
 * over the run's event stream, and out of a journalled message row. Neither
 * arrives as anything else, and neither can. But both were typed `unknown` all
 * the way to the surfaces that render them, so five presentation modules each
 * wrote the same boolean guard to get back to something they could index — and
 * every read after the guard was still a probe against a shape nobody had
 * checked.
 *
 * Naming the type is what retires those. A value of {@link AgentPayload} narrows
 * under an ordinary `typeof` test, which TypeScript verifies, and indexing a
 * {@link AgentPayloadObject} answers with another `AgentPayload` rather than `unknown`, so
 * the narrowing stops at one step instead of recurring at every field.
 *
 * This is the floor, not the ceiling, and the distinction matters. `AgentPayload`
 * says the value is JSON, which is true of every tool result and is what makes
 * the `typeof` narrowing sound. It does not say which fields a result has:
 * {@link AgentPayloadObject} carries an index signature, so `output.noteId` type-checks
 * whatever the tool was. A surface that reads a *named* set of fields should
 * parse them with a schema rather than index for them — `canvas-subject.ts`
 * already does exactly that for the three diagram tools, and the tool contract
 * map will generalise it. An open index signature is the right type only where
 * the surface genuinely renders whatever keys it is given.
 */
export type AgentPayload =
	string | number | boolean | null | readonly AgentPayload[] | AgentPayloadObject;

export interface AgentPayloadObject {
	readonly [key: string]: AgentPayload;
}

/**
 * Read succeeded, or read failed and says where.
 *
 * A failure has to be a value the caller reads rather than a `undefined` it can
 * ignore: "the tool returned nothing" and "the tool returned something this
 * code could not read" are different facts, and collapsing them is how a failed
 * call comes to render as a call that quietly succeeded (ADR 0015).
 */
export type AgentPayloadResult =
	| { readonly kind: 'valid'; readonly value: AgentPayload }
	| { readonly kind: 'corrupt'; readonly message: string };

export type AgentPayloadObjectResult =
	| { readonly kind: 'valid'; readonly value: AgentPayloadObject }
	| { readonly kind: 'corrupt'; readonly message: string };

/**
 * Hand-written rather than a zod schema, for one reason that decides it.
 *
 * `z.record(z.string(), …)` accepts any object and iterates its own enumerable
 * keys, so a `Date` — which has none — parses clean to `{}`. That is the silent
 * wrong answer this whole exercise exists to remove, and it would land on the
 * one input the type could not warn about. Checking the prototype rejects a
 * `Date`, a `Map`, and a class instance by name instead.
 *
 * The recursion also builds the value as it goes, so what comes back is proven
 * rather than asserted at the end.
 */
// audit-allow: no-unknown-type — Names a value readAgentPayload could not read, for the message that says so.
const describe = (value: unknown): string => {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (Array.isArray(value)) return 'an array';
	if (typeof value !== 'object') return `a ${typeof value}`;
	const name: unknown = value.constructor?.name;
	return typeof name === 'string' ? `a ${name}` : 'an object';
};

const isPlainObject = (value: object): boolean => {
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

// audit-allow: no-unknown-type — The recursive reader itself; classifying unread JSON is its whole job.
const readAt = (value: unknown, path: string): AgentPayloadResult => {
	if (value === null) return { kind: 'valid', value: null };
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return { kind: 'valid', value };
		case 'number':
			// `NaN` and `Infinity` have no JSON spelling: `JSON.stringify` writes them
			// as `null`, so a number that is not finite never survived the wire and a
			// value claiming to be one did not come from there.
			return Number.isFinite(value)
				? { kind: 'valid', value }
				: { kind: 'corrupt', message: `${path} is ${String(value)}, which JSON cannot carry` };
		case 'object':
			break;
		default:
			return { kind: 'corrupt', message: `${path} is ${describe(value)}` };
	}
	if (Array.isArray(value)) {
		const items: AgentPayload[] = [];
		for (const [index, item] of value.entries()) {
			const read = readAt(item, `${path}[${index}]`);
			if (read.kind === 'corrupt') return read;
			items.push(read.value);
		}
		return { kind: 'valid', value: items };
	}
	if (!isPlainObject(value)) return { kind: 'corrupt', message: `${path} is ${describe(value)}` };
	const entries: [string, AgentPayload][] = [];
	for (const [key, item] of Object.entries(value)) {
		// A property holding `undefined` is exactly what `JSON.stringify` drops, so the wire
		// never carried the key at all and reading it as corrupt refuses a value JSON can
		// represent perfectly. The db mappers build every optional field this way —
		// `noteId: row.noteId ?? undefined` writes the key with no value — so a tool returning
		// a domain object failed *after* its row was already committed, and no retry could
		// ever succeed. `undefined` in an array and at the root stay corrupt: `stringify`
		// turns the first into `null` and the second into nothing, so neither came off a wire.
		if (item === undefined) continue;
		const read = readAt(item, `${path}.${key}`);
		if (read.kind === 'corrupt') return read;
		entries.push([key, read.value]);
	}
	return { kind: 'valid', value: Object.fromEntries(entries) };
};

/**
 * Which arm of the union a value is in.
 *
 * A predicate here is not the `isRecord` pattern this module exists to retire.
 * That one claimed to turn `unknown` into a shape nobody had checked; this one
 * picks a member out of a closed union that already holds, and the compiler
 * verifies the branch. It is needed because `Array.isArray` cannot narrow a
 * `readonly` array member out of a union — TypeScript's signature narrows to
 * `any[]`, which `readonly AgentPayload[]` is not assignable to, so the object
 * branch would otherwise still see the array.
 */
export const isAgentPayloadObject = (value: AgentPayload): value is AgentPayloadObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The elements, when the value is an array. Narrows where `Array.isArray` cannot. */
export const agentPayloadItems = (value: AgentPayload): readonly AgentPayload[] | undefined =>
	Array.isArray(value) ? value : undefined;

/** The value, or where reading it stopped. `root` names the whole value in a message. */
// audit-allow: no-unknown-type — Entry point of the hand-written JSON reader a zod schema cannot replace.
export const readAgentPayload = (value: unknown): AgentPayloadResult => readAt(value, 'root');

/**
 * The same, for a caller that needs an object at the top.
 *
 * Tool arguments are always an object — the provider builds them from the tool's
 * own parameter schema — so a caller that gets an array or a string back has not
 * received arguments and should not pretend it has.
 */
// audit-allow: no-unknown-type — The same reader, narrowed to the object arm.
export const readAgentPayloadObject = (value: unknown): AgentPayloadObjectResult => {
	const read = readAgentPayload(value);
	if (read.kind === 'corrupt') return read;
	const { value: parsed } = read;
	return isAgentPayloadObject(parsed)
		? { kind: 'valid', value: parsed }
		: { kind: 'corrupt', message: `root is ${describe(value)}, not an object` };
};
