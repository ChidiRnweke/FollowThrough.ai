import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { readSkillManifest } from '$lib/remote/skills/manifest-reader.server';
import { serializeSkillManifest } from '$lib/services/skills/manifest';
import { context, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

it('round-trips imported instructions and portable metadata through persisted skill detail', async () => {
	const { owner, project } = await seedNote('21301');
	const tx = createTransactionContext(context.db);
	const controller = skillController(tx.database, tx.transactionRunner);
	const created = await controller.create(owner, { name: 'Original title', projectId: project.id });
	await controller.update(owner, { noteId: created.skill.note.id, isEnabled: false });
	const manifest = readSkillManifest(
		'---\nname: portable-review\ndescription: Review changes\nlicense: MIT\ncompatibility: Requires repository access\nmetadata:\n  owner: team\n  followthrough.allow-implicit-invocation: "false"\n---\n\n# Review\n\n- Read the diff.\n- Explain the result.\n'
	);
	await controller.update(owner, {
		noteId: created.skill.note.id,
		content: { kind: 'manifest', baseRevision: created.skill.note.currentRevision, manifest }
	});
	const { skill } = await controller.get(owner, { noteId: created.skill.note.id });
	const exported = serializeSkillManifest({ ...skill, instructions: skill.note.plainText });
	expect({
		manifest: readSkillManifest(exported),
		id: skill.note.id,
		title: skill.note.title,
		enabled: skill.isEnabled
	}).toEqual({ manifest, id: created.skill.note.id, title: 'Original title', enabled: false });
});
