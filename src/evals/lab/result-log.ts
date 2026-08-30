import { readFile, rename, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const pendingWrites = new Map<string, Promise<void>>();

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

const evalResultRecordBaseSchema = z.object({
	runId: z.string(),
	section: z.string(),
	subjectModel: z.string(),
	commit: z.string(),
	profile: z.string(),
	caseId: z.string(),
	sample: z.number().int().positive(),
	durationMs: z.number().int().nonnegative(),
	completedAt: z.iso.datetime()
});

const evalResultRecordSchema = z.discriminatedUnion('outcome', [
	evalResultRecordBaseSchema.extend({ outcome: z.literal('passed') }).strict(),
	evalResultRecordBaseSchema.extend({ outcome: z.literal('failed'), failure: z.string() }).strict()
]);

const evalResultLogSchema = z.array(evalResultRecordSchema);

export type EvalResultRecordInput = Readonly<z.infer<typeof evalResultRecordSchema>>;

export const buildEvalResultRecord = (input: EvalResultRecordInput): EvalResultRecordInput => ({
	...input
});

/**
 * What was on disk, as three separate answers.
 *
 * Corruption used to be indistinguishable from a real I/O failure: the parse
 * error escaped `persist` and failed the case that was merely trying to record
 * its own result. A single truncated write therefore turned every subsequent
 * eval run red — every case, in every section — with a JSON syntax error
 * standing where the actual finding should have been, until somebody thought to
 * delete a scratch file in /tmp. This log is provenance, never a verdict; it
 * must not be able to fail a case.
 */
type LogContents =
	| { readonly kind: 'entries'; readonly entries: readonly EvalResultRecordInput[] }
	| { readonly kind: 'absent' }
	| { readonly kind: 'corrupt'; readonly reason: string };

const readLog = async (path: string): Promise<LogContents> => {
	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch (error) {
		if (isMissingFile(error)) return { kind: 'absent' };
		throw error;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return { kind: 'entries', entries: evalResultLogSchema.parse(parsed) };
	} catch (error) {
		return { kind: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
	}
};

export async function appendEvalResult(
	path: string,
	entry: Readonly<EvalResultRecordInput>
): Promise<void> {
	const previous = pendingWrites.get(path) ?? Promise.resolve();
	const persist = async () => {
		const contents = await readLog(path);
		if (contents.kind === 'corrupt') {
			// Moved rather than overwritten: whatever produced it is a bug worth
			// keeping the evidence of, and the operator is told where it went.
			const quarantine = `${path}.corrupt-${Date.now()}`;
			await rename(path, quarantine);
			process.stderr.write(
				`[evals] result log was unreadable (${contents.reason}); moved to ${quarantine} and started a new one.\n`
			);
		}
		const entries = contents.kind === 'entries' ? contents.entries : [];
		await writeFile(path, JSON.stringify([...entries, entry], null, 2), 'utf8');
	};
	const write = previous.then(persist, persist);
	pendingWrites.set(path, write);

	try {
		await write;
	} finally {
		if (pendingWrites.get(path) === write) pendingWrites.delete(path);
	}
}
