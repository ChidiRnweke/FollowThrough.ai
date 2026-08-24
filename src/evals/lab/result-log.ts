import { readFile, writeFile } from 'node:fs/promises';

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
	let entries: EvalResultRecordInput[] = [];
	try {
		entries = JSON.parse(await readFile(path, 'utf8')) as EvalResultRecordInput[];
	} catch (error) {
		if (!isMissingFile(error)) throw error;
	}
	await writeFile(path, JSON.stringify([...entries, entry], null, 2), 'utf8');
}
