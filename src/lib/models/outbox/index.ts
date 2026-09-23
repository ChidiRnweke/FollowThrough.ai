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
/** One exact applied outcome per resource; ordinary cache refreshes never replace this proof. */
export const writeReceiptSchema = <T>(value: z.ZodType<T>): z.ZodType<WriteReceipt<T>> =>
	z.object({
		operationId: z.string().uuid(),
		resource: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('found'), snapshot: z.object({ etag: syncEtagSchema, value }) }),
			deletionSchema
		])
	});

export type WriteOutcome<T> =
	| { readonly kind: 'applied'; readonly receipt: WriteReceipt<T> }
	| { readonly kind: 'proven'; readonly proof: AppliedWriteProof }
	| { readonly kind: 'conflict'; readonly remote: ServerResource<T> }
	| { readonly kind: 'rejected'; readonly message: string };

/** Permanent application evidence. The server need not retain the original resource body. */
export const appliedWriteProofSchema = z.object({
	operationId: z.string().uuid(),
	etag: syncEtagSchema,
	resourceKind: z.enum(['found', 'deleted'])
});
export type AppliedWriteProof = z.infer<typeof appliedWriteProofSchema>;
export type WriteRecovery<T> =
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'applied'; readonly receipt: WriteReceipt<T> }
	| { readonly kind: 'proven'; readonly proof: AppliedWriteProof };

/** Every observed base carries the validator of its exact server representation. */
export type WriteBase<T> = SyncSnapshot<T>;
export type WriteObservation<T> =
	| Exclude<ServerResource<T>, { kind: 'found' }>
	| { readonly kind: 'found'; readonly snapshot: WriteBase<T> };
export type WriteBaseResolution<T> = {
	readonly kind: 'conflict';
	readonly remote: ServerResource<T>;
};

export interface WriteDraft<C, T> {
	readonly operationId: string;
	readonly key: string;
	readonly command: C;
	readonly base: WriteBase<T> | null;
	/** The pending local version this edit was made against, separate from queue order. */
	readonly basedOn: string | null;
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
	| { readonly kind: 'conflict'; readonly remote: WriteObservation<T> }
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
			base: z.object({ etag: syncEtagSchema, value }).nullable(),
			basedOn: z.string().uuid().nullable(),
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

export type WriteContent<C, T> = Pick<
	WriteDraft<C, T>,
	'command' | 'local' | 'coalesce' | 'references'
>;
export type DraftStatus = 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';
export interface WriteConflictView<T> {
	readonly base: T | null;
	readonly local: T | null;
	readonly remote:
		{ readonly kind: 'found'; readonly value: T } | { readonly kind: 'deleted' | 'unavailable' };
}
