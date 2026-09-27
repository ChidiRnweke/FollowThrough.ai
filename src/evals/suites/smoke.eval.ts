import { describe, expect, it } from 'vitest';
import { seedActor } from '../lab/workspace';
import { createLab } from '../lab/application';

describe('evals lab harness', () => {
	it('queries the migrated application schema with pgvector available', async () => {
		const lab = await createLab();
		try {
			const actor = await seedActor(lab);
			const shell = await lab.controllers.workspace().getShellContext(actor);
			expect(shell.projects.map((project) => project.role)).toEqual(['inbox']);
		} finally {
			await lab.close();
		}
	});
});
