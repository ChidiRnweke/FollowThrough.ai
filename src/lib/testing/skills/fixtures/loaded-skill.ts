import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
const noteMarkdown = new NodeNoteMarkdown();
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import type { AgentRunId } from '$lib/models/agent';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';

import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

export const loadedSkillFixture = (body = 'Number every finding.') => {
	const note = noteBuilder({
		kind: 'skill',
		title: 'Compliance format',
		...noteMarkdown.read(body)
	});
	const notes = new InMemoryNoteRepository();
	notes.notes = [note];
	const skills = new InMemorySkillRepository(notes);
	skills.skills = [
		{
			note,
			slug: 'compliance-format',
			description: 'Formats responses for compliance review',
			triggerHints: ['compliance', 'audit'],
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true
		}
	];
	const provenance = new InMemoryProvenanceRepository();
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			producerKind: 'agent',
			producerName: 'FollowThrough Workbench Agent',
			pipeline: 'agent',
			runId: '70000000-0000-4000-8000-000000000001' as AgentRunId,
			model: 'test-model',
			metadata: {},
			createdAt: testNow
		}
	];
	const library = createSkillServices(skills, notes, provenance);
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			skillPortability: new SkillPortabilityService(),
			skillMetadataEditing: new SkillMetadataEditingService(),
			noteReferences: new NoteReferenceService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			skillFinder: library.finder,
			skillUsageRecorder: library.usageRecorder,
			skillUsageLister: library.usageLister,
			transactionRunner: new InMemoryTransactionRunner([notes, skills])
		})
	);
	return { controller, note, notes, skills };
};
