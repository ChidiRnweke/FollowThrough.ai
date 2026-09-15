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

export function mapAppliedChange<Input, Output>(
	change: AppliedChange<Input>,
	map: (record: Input) => Output
): AppliedChange<Output> {
	switch (change.kind) {
		case 'created':
			return { kind: 'created', after: map(change.after) };
		case 'modified':
			return { kind: 'modified', before: map(change.before), after: map(change.after) };
		case 'unchanged':
			return { kind: 'unchanged', after: map(change.after) };
	}
}
