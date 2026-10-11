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
import { z } from 'zod';

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

/** A JSON value, including prototype checks before Zod can turn a class into an empty record. */
export const agentPayloadSchema: z.ZodType<AgentPayload> = z.lazy(() =>
	z.preprocess(
		(value, context) => {
			if (value === undefined) {
				context.addIssue({ code: 'custom', message: 'is undefined' });
				return z.NEVER;
			}
			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				const prototype = Object.getPrototypeOf(value);
				if (prototype !== Object.prototype && prototype !== null) {
					context.addIssue({ code: 'custom', message: 'is not a plain JSON object' });
					return z.NEVER;
				}
			}
			return value;
		},
		z.union([
			z.string(),
			z.number(),
			z.boolean(),
			z.null(),
			z.array(agentPayloadSchema),
			agentPayloadObjectSchema
		])
	)
);

export const agentPayloadObjectSchema: z.ZodType<AgentPayloadObject> = z.preprocess(
	(value, context) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			Array.isArray(value) ||
			(Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
		) {
			context.addIssue({ code: 'custom', message: 'is not a plain JSON object' });
			return z.NEVER;
		}
		return new Map(Object.entries(value));
	},
	z
		.map(z.string(), z.lazy(() => agentPayloadSchema).optional())
		.transform((record) =>
			Object.fromEntries(
				[...record].flatMap(([key, value]) => (value === undefined ? [] : [[key, value]]))
			)
		)
);

export const agentPayloadResultSchema = agentPayloadSchema
	.transform((value): AgentPayloadResult => ({ kind: 'valid', value }))
	.catch((context) => {
		const issues = [...context.error.issues];
		for (let index = 0; index < issues.length; index++) {
			const issue = issues[index]!;
			if (issue.code === 'invalid_union')
				issues.push(
					...issue.errors
						.flat()
						.map((child) => ({ ...child, path: [...issue.path, ...child.path] }))
				);
		}
		const issue = issues.reduce((deepest, candidate) =>
			candidate.path.length > deepest.path.length ? candidate : deepest
		);
		const path = issue.path.reduce<string>(
			(text, part) => (typeof part === 'number' ? `${text}[${part}]` : `${text}.${String(part)}`),
			'root'
		);
		return { kind: 'corrupt', message: `${path} ${issue.message}` };
	});

export const agentPayloadObjectResultSchema = agentPayloadObjectSchema
	.transform((value): AgentPayloadObjectResult => ({ kind: 'valid', value }))
	.catch((context) => {
		const issues = [...context.error.issues];
		for (let index = 0; index < issues.length; index++) {
			const issue = issues[index]!;
			if (issue.code === 'invalid_union')
				issues.push(
					...issue.errors
						.flat()
						.map((child) => ({ ...child, path: [...issue.path, ...child.path] }))
				);
		}
		const issue = issues.reduce((deepest, candidate) =>
			candidate.path.length > deepest.path.length ? candidate : deepest
		);
		const path = issue.path.reduce<string>(
			(text, part) => (typeof part === 'number' ? `${text}[${part}]` : `${text}.${String(part)}`),
			'root'
		);
		return { kind: 'corrupt', message: `${path} ${issue.message}` };
	});
