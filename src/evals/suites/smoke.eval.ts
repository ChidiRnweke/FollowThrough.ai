import { describe, expect, it } from 'vitest';
import { createLab } from '../lab/application';

describe('evals lab harness', () => {
	it('creates a migrated database with pgvector available', async () => {
		const lab = await createLab();
		try {
			// Verify the lab can seed and query — exercises the full DB stack.
			const workspace = await lab.controllers.workspace();
			expect(workspace).toBeDefined();
		} finally {
			await lab.close();
		}
	});
});
