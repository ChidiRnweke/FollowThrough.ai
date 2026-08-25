import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { UserId } from '$lib/models/identity';
import { createLab } from '../lab/application';

describe('evals lab harness', () => {
	it('queries the migrated application schema with pgvector available', async () => {
		const lab = await createLab();
		try {
			const shell = await lab.controllers
				.workspace()
				.getShellContext({ userId: randomUUID() as UserId });
			expect(shell.projects).toEqual([]);
		} finally {
			await lab.close();
		}
	});
});
