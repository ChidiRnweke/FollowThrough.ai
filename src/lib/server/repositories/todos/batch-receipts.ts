import type {
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	TodoBatchLookup
} from '$lib/models/todos';

export interface TodoBatchReceiptRepository {
	lock(requestId: string): Promise<void>;
	find(input: CreateTodoBatchInput): Promise<TodoBatchLookup>;
	save(input: CreateTodoBatchInput, result: CreateTodoBatchOutput): Promise<void>;
}
