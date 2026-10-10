import type { Attributes } from '@opentelemetry/api';
import type { OperationObserver } from '$lib/server/adapters/telemetry/tracing';
import type { WorkflowTraceContext } from '$lib/models/telemetry';

type ObservedOperation = {
	readonly name: string;
	readonly context: WorkflowTraceContext;
} & (
	| {
			readonly kind: 'completed';
			readonly output: string | undefined;
			readonly attributes: Attributes | undefined;
	  }
	| { readonly kind: 'failed'; readonly error: string }
);

export class InMemoryOperationObserver implements OperationObserver {
	readonly operations: ObservedOperation[] = [];
	async run<T>(
		name: string,
		context: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string,
		describeAttributes?: (result: T) => Attributes
	): Promise<T> {
		try {
			const result = await body();
			this.operations.push({
				name,
				context,
				kind: 'completed',
				output: describeOutput?.(result),
				attributes: describeAttributes?.(result)
			});
			return result;
		} catch (error) {
			this.operations.push({
				name,
				context,
				kind: 'failed',
				error: error instanceof Error ? error.message : String(error)
			});
			throw error;
		}
	}
}
