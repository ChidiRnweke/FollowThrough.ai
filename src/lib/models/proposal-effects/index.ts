import { z } from 'zod';

export type AppliedChange<Record> =
	| { readonly kind: 'created'; readonly after: Record }
	| { readonly kind: 'modified'; readonly before: Record; readonly after: Record }
	| { readonly kind: 'unchanged'; readonly after: Record };
export type RecordedChange<Record> =
	| (Extract<AppliedChange<Record>, { kind: 'created' | 'modified' }> & {
			readonly version: string;
	  })
	| Extract<AppliedChange<Record>, { kind: 'unchanged' }>;
export interface ApplicationEffect<Record> {
	readonly changes: readonly RecordedChange<Record>[];
}
export function applicationEffectSchema<Record>(record: z.ZodType<Record>) {
	return z
		.object({
			changes: z
				.array(
					z.discriminatedUnion('kind', [
						z
							.object({ kind: z.literal('created'), after: record, version: z.string().min(1) })
							.strict(),
						z
							.object({
								kind: z.literal('modified'),
								before: record,
								after: record,
								version: z.string().min(1)
							})
							.strict(),
						z.object({ kind: z.literal('unchanged'), after: record }).strict()
					])
				)
				.min(1)
		})
		.strict();
}
