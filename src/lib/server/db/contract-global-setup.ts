import type { TestProject } from 'vitest/node';
import { startPostgresTestcontainer } from './testcontainer';

export default async function setup({ provide }: TestProject): Promise<() => Promise<void>> {
	const context = await startPostgresTestcontainer();
	provide('postgresUrl', context.url);
	return () => context.stop();
}

declare module 'vitest' {
	export interface ProvidedContext {
		postgresUrl: string;
	}
}
