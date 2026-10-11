import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { seedActor } from './workspace';
import { createApplication } from '$lib/server/application';
import { InMemoryAttachmentClaims } from '$lib/testing/attachments/fakes/claims';
import { createPGliteDatabase } from './pglite-database';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { InMemoryAttachmentStorage, StubModelCatalog } from './fakes';

it('initializes a fresh evaluation account before opening its provisioned shell', async () => {
	const db = await createPGliteDatabase();
	try {
		const application = createApplication(testActor(), {
			db: db.database,
			notifications: db.notifications,
			transactionRunner: db.transactionRunner,
			tokenizer: testTokenizer,
			attachmentClaims: new InMemoryAttachmentClaims(),
			openRouterApiKey: 'unused-local-test',
			mistralApiKey: 'unused-local-test',
			overrides: {
				attachmentStorage: new InMemoryAttachmentStorage(),
				modelCatalog: new StubModelCatalog()
			}
		});
		const actor = await seedActor({ db: db.database, controllers: application.controllers });
		const shell = await application.controllers.workspace().getShellContext();
		expect({
			role: shell.user.role,
			projects: shell.projects.map((project) => project.role)
		}).toEqual({ role: 'ADMIN', projects: ['inbox'] });
	} finally {
		await db.close();
	}
}, 30000);
