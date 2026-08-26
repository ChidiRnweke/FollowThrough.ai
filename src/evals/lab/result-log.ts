import { readFile, writeFile } from 'node:fs/promises';

const pendingWrites = new Map<string, Promise<void>>();

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

export interface EvalResultRecordInput {
	readonly runId: string;
	readonly section: string;
	readonly subjectModel: string;
	readonly commit: string;
	readonly profile: string;
	readonly caseId: string;
	readonly sample: number;
	readonly durationMs: number;
	readonly outcome: 'passed' | 'failed';
	readonly failure?: string;
	readonly completedAt: string;
}

export const buildEvalResultRecord = (
	input: EvalResultRecordInput
): Readonly<EvalResultRecordInput> => ({ ...input });

export async function appendEvalResult(
	path: string,
	entry: Readonly<EvalResultRecordInput>
): Promise<void> {
	const previous = pendingWrites.get(path) ?? Promise.resolve();
	const persist = async () => {
		let entries: EvalResultRecordInput[] = [];
		try {
			entries = JSON.parse(await readFile(path, 'utf8')) as EvalResultRecordInput[];
		} catch (error) {
			if (!isMissingFile(error)) throw error;
		}
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
