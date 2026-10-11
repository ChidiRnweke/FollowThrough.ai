import type { MermaidSourceValidator } from '$lib/server/services/diagrams/submission-validation';
import { ValidationError } from '$lib/errors';
/** Accepts every source except the ones a test rejects, and can hold a validation open. */
export class InMemoryMermaidValidator implements MermaidSourceValidator {
	readonly started = Promise.withResolvers<void>();
	readonly rejections = new Map<string, string>();
	gate: Promise<void> | undefined;
	async validate(source: string): Promise<void> {
		this.started.resolve();
		await this.gate;
		const rejection = this.rejections.get(source);
		if (rejection) throw new ValidationError(rejection);
	}
}
