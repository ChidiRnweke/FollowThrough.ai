import { z } from 'zod';
import {
	syncEtagSchema,
	deletionSchema,
	type SyncSnapshot,
	type SyncObjectRead
} from '$lib/models/sync';

export type ServerResource<T> = Exclude<SyncObjectRead<T>, { kind: 'unchanged' }>;
export type WriteReceipt<T> = {
	readonly operationId: string;
	readonly resource: Exclude<ServerResource<T>, { kind: 'unavailable' }>;
};
export type WriteOutcome<T> =
	| { readonly kind: 'applied'; readonly receipt: WriteReceipt<T> }
	| { readonly kind: 'conflict'; readonly remote: ServerResource<T> }
	| { readonly kind: 'rejected'; readonly message: string };

export interface WriteDraft<C, T> {
	readonly operationId: string;
	readonly key: string;
	readonly command: C;
	readonly base: SyncSnapshot<T> | null;
	readonly local: T | null;
	readonly coalesce: string | null;
	readonly references: readonly string[];
}

export type WriteIntent<C, T> = Omit<WriteDraft<C, T>, 'references'> & {
	readonly dependencies: readonly string[];
};
export type Delivery<T> =
	| { readonly kind: 'queued' }
	| { readonly kind: 'sending' }
	| { readonly kind: 'retry'; readonly message: string }
	| { readonly kind: 'conflict'; readonly remote: ServerResource<T> }
	| { readonly kind: 'rejected'; readonly message: string };
export interface OutboxEntry<C, T> {
	readonly sequence: number;
	readonly intent: WriteIntent<C, T>;
	readonly delivery: Delivery<T>;
}

export const outboxEntrySchema = <C, T>(
	command: z.ZodType<C>,
	value: z.ZodType<T>
): z.ZodType<OutboxEntry<C, T>> => {
	const snapshot = z.object({ etag: syncEtagSchema, value });
	return z.object({
		sequence: z.number().int().positive(),
		intent: z.object({
			operationId: z.string().uuid(),
			key: z.string().min(1),
			command,
			base: snapshot.nullable(),
			local: value.nullable(),
			coalesce: z.string().nullable(),
			dependencies: z.array(z.string().uuid())
		}),
		delivery: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('queued') }),
			z.object({ kind: z.literal('sending') }),
			z.object({ kind: z.literal('retry'), message: z.string() }),
			z.object({ kind: z.literal('rejected'), message: z.string() }),
			z.object({
				kind: z.literal('conflict'),
				remote: z.discriminatedUnion('kind', [
					z.object({ kind: z.literal('found'), snapshot }),
					deletionSchema,
					z.object({ kind: z.literal('unavailable') })
				])
			})
		])
	});
};

/** Append in one storage transaction so another tab cannot bypass a preceding local write. */
export const appendWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	draft: WriteDraft<C, T>,
	sequence: number
): readonly OutboxEntry<C, T>[] => {
	if (entries.some((entry) => entry.intent.operationId === draft.operationId))
		throw new Error('A local operation identity must be unique');
	const latest = new Map(entries.map((entry) => [entry.intent.key, entry]));
	const previous = latest.get(draft.key);
	const dependencies = [
		...new Set(
			[draft.key, ...draft.references].flatMap((key) => {
				const entry = latest.get(key);
				return entry ? [entry.intent.operationId] : [];
			})
		)
	];
	const { references, ...intent } = draft;
	void references;
	if (
		previous?.delivery.kind === 'queued' &&
		draft.coalesce !== null &&
		previous.intent.coalesce === draft.coalesce &&
		!entries.some((entry) => entry.intent.dependencies.includes(previous.intent.operationId))
	) {
		return entries.map((entry) =>
			entry !== previous
				? entry
				: {
						...entry,
						intent: {
							...entry.intent,
							command: draft.command,
							local: draft.local,
							dependencies: [
								...new Set([
									...entry.intent.dependencies,
									...dependencies.filter((id) => id !== entry.intent.operationId)
								])
							]
						}
					}
		);
	}
	return [
		...entries,
		{ sequence, intent: { ...intent, dependencies }, delivery: { kind: 'queued' } }
	];
};

export const nextWrite = <C, T>(entries: readonly OutboxEntry<C, T>[]): OutboxEntry<C, T> | null =>
	entries.find(
		(entry) =>
			(entry.delivery.kind === 'queued' || entry.delivery.kind === 'retry') &&
			entry.intent.dependencies.length === 0
	) ?? null;

export const beginWrite = <C, T>(entry: OutboxEntry<C, T>): OutboxEntry<C, T> => {
	if (
		(entry.delivery.kind !== 'queued' && entry.delivery.kind !== 'retry') ||
		entry.intent.dependencies.length
	)
		throw new Error('Only an unblocked queued write can be sent');
	return { ...entry, delivery: { kind: 'sending' } };
};

export const failWrite = <C, T>(entry: OutboxEntry<C, T>, message: string): OutboxEntry<C, T> =>
	entry.delivery.kind === 'sending' ? { ...entry, delivery: { kind: 'retry', message } } : entry;

/** Only successful acknowledgement unblocks descendants and changes their server base. */
export const acknowledgeWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	receipt: WriteReceipt<T>
): readonly OutboxEntry<C, T>[] => {
	const sent = entries.find((entry) => entry.intent.operationId === receipt.operationId);
	if (!sent) return entries;
	if (sent.delivery.kind !== 'sending' && sent.delivery.kind !== 'retry')
		throw new Error('Only a submitted write can be acknowledged');
	return entries
		.filter((entry) => entry !== sent)
		.map((entry) => {
			if (!entry.intent.dependencies.includes(receipt.operationId)) return entry;
			return {
				...entry,
				intent: {
					...entry.intent,
					dependencies: entry.intent.dependencies.filter((id) => id !== receipt.operationId),
					base:
						entry.intent.key === sent.intent.key
							? receipt.resource.kind === 'found'
								? receipt.resource.snapshot
								: null
							: entry.intent.base
				}
			};
		});
};

export const settleWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationId: string,
	outcome: WriteOutcome<T>
): readonly OutboxEntry<C, T>[] => {
	if (outcome.kind === 'applied') {
		if (outcome.receipt.operationId !== operationId)
			throw new Error('The receipt identifies another operation');
		return acknowledgeWrite(entries, outcome.receipt);
	}
	return entries.map((entry) =>
		entry.intent.operationId === operationId &&
		(entry.delivery.kind === 'sending' || entry.delivery.kind === 'retry')
			? { ...entry, delivery: outcome }
			: entry
	);
};
