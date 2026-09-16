import { diagramActionSubmissionSchema, type DiagramActionSubmission } from '$lib/models/diagrams';

type GenerateSubmission = Extract<DiagramActionSubmission, { operation: 'generate' }>;
type ReviseSubmission = Extract<DiagramActionSubmission, { operation: 'revise' }>;
type ConvertSubmission = Extract<DiagramActionSubmission, { operation: 'convert' }>;
type DiagramInput =
	| Omit<GenerateSubmission, 'requestId'>
	| Omit<ReviseSubmission, 'requestId'>
	| Omit<ConvertSubmission, 'requestId'>;

/** Retains the full uncertain diagram request until the server returns its receipt. */
export class DiagramSubmissions {
	constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
	prepare(accountId: string, input: Omit<GenerateSubmission, 'requestId'>): GenerateSubmission;
	prepare(accountId: string, input: Omit<ReviseSubmission, 'requestId'>): ReviseSubmission;
	prepare(accountId: string, input: Omit<ConvertSubmission, 'requestId'>): ConvertSubmission;
	prepare(accountId: string, input: DiagramInput): DiagramActionSubmission {
		const requests = this.read(accountId);
		const request = diagramActionSubmissionSchema.parse({
			...input,
			requestId: crypto.randomUUID()
		});
		const { requestId: _requestId, ...intent } = request;
		const existing = requests.find(
			({ requestId: _id, ...previous }) => JSON.stringify(previous) === JSON.stringify(intent)
		);
		if (existing) return existing;
		this.storage.setItem(this.key(accountId), JSON.stringify([...requests, request]));
		return request;
	}
	acknowledge(accountId: string, requestId: string): void {
		const remaining = this.read(accountId).filter((request) => request.requestId !== requestId);
		if (remaining.length) this.storage.setItem(this.key(accountId), JSON.stringify(remaining));
		else this.storage.removeItem(this.key(accountId));
	}
	private read(accountId: string): readonly DiagramActionSubmission[] {
		const value = this.storage.getItem(this.key(accountId));
		return value === null ? [] : diagramActionSubmissionSchema.array().parse(JSON.parse(value));
	}
	private key(accountId: string): string {
		return `followthrough.notes.diagram-submissions.${accountId}`;
	}
}
