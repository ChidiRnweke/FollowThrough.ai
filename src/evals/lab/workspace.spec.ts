import type { ActorContext } from '$lib/models/identity';
import { expect, it } from 'vitest';
import { seedActor } from './workspace';
import { createApplication } from '$lib/server/application';
import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryAttachmentClaims } from '$lib/testing/attachments/fakes/claims';
import { createPGliteDatabase } from './pglite-database';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { InMemoryAttachmentStorage, StubModelCatalog } from './fakes';

it('initializes a fresh evaluation account before opening its provisioned shell', async () => {
	const db = await createPGliteDatabase();
	try {
		const forActor = (actor: ActorContext) =>
			createApplication(actor, {
				db: db.database,
				notifications: db.notifications,
				transactionRunner: db.transactionRunner,
				tokenizer: testTokenizer,
				now: testClock,
				attachmentClaims: new InMemoryAttachmentClaims(),
				openRouterApiKey: 'unused-local-test',
				mistralApiKey: 'unused-local-test',
				overrides: {
					attachmentStorage: new InMemoryAttachmentStorage(),
					modelCatalog: new StubModelCatalog()
				}
			});
		const actor = await seedActor({ db: db.database, forActor });
		const shell = await forActor(actor).controllers.workspace().getShellContext();
		expect({
			role: shell.user.role,
			projects: shell.projects.map((project) => project.role)
		}).toEqual({ role: 'ADMIN', projects: ['inbox'] });
	} finally {
		await db.close();
	}
}, 30000);
