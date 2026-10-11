import type { ActorContext } from '$lib/models/identity';
import type {
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	TodoBatchLookup
} from '$lib/models/todos';
import type { TodoBatchReceiptRepository } from '$lib/server/repositories/todos/batch-receipts';
import { ValidationError } from '$lib/errors';

export interface TodoBatchReceiptService {
	findForUpdate(input: CreateTodoBatchInput): Promise<Exclude<TodoBatchLookup, { kind: 'reused' }>>;
	save(input: CreateTodoBatchInput, result: CreateTodoBatchOutput): Promise<void>;
}
export class TodoBatchReceipts implements TodoBatchReceiptService {
	constructor(private readonly repository: TodoBatchReceiptRepository) {}
	async findForUpdate(
		input: CreateTodoBatchInput
	): Promise<Exclude<TodoBatchLookup, { kind: 'reused' }>> {
		await this.repository.lock(input.requestId);
		const previous = await this.repository.find(input);
		if (previous.kind === 'reused')
			throw new ValidationError('The task batch request ID was already used for different input');
		return previous;
	}
	save(input: CreateTodoBatchInput, result: CreateTodoBatchOutput): Promise<void> {
		return this.repository.save(input, result);
	}
}
