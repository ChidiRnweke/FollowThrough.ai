import type { ActorContext } from '$lib/models/identity';
import type {
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	TodoBatchLookup
} from '$lib/models/todos';

export interface TodoBatchReceiptRepository {
	lock(actor: ActorContext, requestId: string): Promise<void>;
	find(actor: ActorContext, input: CreateTodoBatchInput): Promise<TodoBatchLookup>;
	save(
		actor: ActorContext,
		input: CreateTodoBatchInput,
		result: CreateTodoBatchOutput
	): Promise<void>;
}
