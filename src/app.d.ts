// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '$lib/models';

declare global {
	namespace App {
		interface Error {
			message: string;
			/** `DomainErrorCode` when the failure came from the domain layer. */
			code?: string;
			/** Set by `handleError` so kit uses it instead of defaulting to 500. */
			status?: number;
		}
		interface Locals {
			user?: User;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
