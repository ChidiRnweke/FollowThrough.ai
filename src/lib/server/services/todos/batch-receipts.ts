import type { ActorContext } from '$lib/models/identity';
import type {
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	TodoBatchLookup
} from '$lib/models/todos';
import type { TodoBatchReceiptRepository } from '$lib/server/repositories/todos/batch-receipts';
import { ValidationError } from '$lib/errors';

export class TodoBatchReceipts {
	constructor(private readonly repository: TodoBatchReceiptRepository) {}
	async findForUpdate(
		actor: ActorContext,
		input: CreateTodoBatchInput
	): Promise<Exclude<TodoBatchLookup, { kind: 'reused' }>> {
		await this.repository.lock(actor, input.requestId);
		const previous = await this.repository.find(actor, input);
		if (previous.kind === 'reused')
			throw new ValidationError('The task batch request ID was already used for different input');
		return previous;
	}
	save(
		actor: ActorContext,
		input: CreateTodoBatchInput,
		result: CreateTodoBatchOutput
	): Promise<void> {
		return this.repository.save(actor, input, result);
	}
}
