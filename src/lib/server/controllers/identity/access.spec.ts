import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import type { User } from '$lib/models/identity';
import { AccessTokens, TokenVerification } from '$lib/server/services/identity/api-tokens';
import { NoteProvenance } from '$lib/server/services/notes/provenance';
import { InMemoryApiTokenRepository } from '$lib/testing/identity/fakes/in-memory-api-tokens';
import { InMemoryAnchorRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { Access, type AccessDependencies } from './access';
import { Authentication, type AuthenticationDependencies } from './authentication';

const reader: User = {
	id: testActor().userId,
	email: 'reader@example.test',
	displayName: 'Reader',
	role: 'USER',
	createdAt: testNow,
	updatedAt: testNow
};

const setup = () => {
	const provenance = new InMemoryProvenanceRepository(testActor());
	const credentials = new InMemoryApiTokenRepository(testActor(), [reader]);
	const tokens = new AccessTokens(credentials);
	const authentication = new Authentication(
		capabilityDependencies<AuthenticationDependencies>({
			tokens: new TokenVerification(credentials)
		})
	);
	const access = new Access(
		testActor(),
		capabilityDependencies<AccessDependencies>({
			tokens,
			provenance: new NoteProvenance(
				testActor(),
				provenance,
				new InMemoryAnchorRepository(testActor()),
				testClock
			)
		})
	);
	return { access, authentication, tokens, provenance };
};

describe('MCP access', () => {
	it('attributes a verified bearer request to the token owner with the token scope', async () => {
		const { access, authentication, tokens, provenance } = setup();
		const minted = await tokens.mint({ name: 'Editor', scope: 'read' });
		const verified = await authentication.verifyBearer(`Bearer ${minted.plaintext}`);
		if (!verified) throw new Error('The minted credential did not verify');
		const result = await access.attributeMcp(verified.scope);
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
		const { authentication, provenance } = setup();
		const result = await authentication.verifyBearer('Bearer ftm_unknown');
		expect({ result, recorded: provenance.provenance }).toEqual({ result: null, recorded: [] });
	});
});
