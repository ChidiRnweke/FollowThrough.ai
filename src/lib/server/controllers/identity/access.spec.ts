import { describe, expect, it } from 'vitest';
import type { User } from '$lib/models/identity';
import { AccessTokens } from '$lib/server/services/identity/api-tokens';
import { NoteProvenance } from '$lib/server/services/notes/provenance';
import { InMemoryApiTokenRepository } from '$lib/testing/identity/fakes/in-memory-api-tokens';
import { InMemoryAnchorRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { Access, type AccessDependencies } from './access';

const reader: User = {
	id: testActor().userId,
	email: 'reader@example.test',
	displayName: 'Reader',
	role: 'USER',
	createdAt: testNow,
	updatedAt: testNow
};

const setup = () => {
	const provenance = new InMemoryProvenanceRepository();
	const tokens = new AccessTokens(new InMemoryApiTokenRepository([reader]));
	const access = new Access(
		capabilityDependencies<AccessDependencies>({
			tokens,
			provenance: new NoteProvenance(provenance, new InMemoryAnchorRepository())
		})
	);
	return { access, tokens, provenance };
};

describe('MCP access', () => {
	it('attributes a verified bearer request to the token owner with the token scope', async () => {
		const { access, tokens, provenance } = setup();
		const minted = await tokens.mint(reader.id, { name: 'Editor', scope: 'read' });
		const result = await access.authenticateMcp(`Bearer ${minted.plaintext}`);
		expect({ result, recorded: provenance.provenance }).toMatchObject({
			result: { actor: { userId: reader.id }, scope: 'read' },
			recorded: [
				{
					id: result?.provenanceId,
					userId: reader.id,
					producerName: 'MCP client',
					metadata: { scope: 'read' }
				}
			]
		});
	});

	it('rejects an unusable credential without recording provenance', async () => {
		const { access, provenance } = setup();
		const result = await access.authenticateMcp('Bearer ftm_unknown');
		expect({ result, recorded: provenance.provenance }).toEqual({ result: null, recorded: [] });
	});
});
