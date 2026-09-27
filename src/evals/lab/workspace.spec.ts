import { expect, it } from 'vitest';
import { seedActor } from './workspace';
import { createApplication } from '$lib/server/application';
import { InMemoryAttachmentClaims } from '$lib/testing/attachments/fakes/claims';
import { createPGliteDatabase } from './pglite-database';
import { InMemoryAttachmentStorage, StubModelCatalog } from './fakes';

it('initializes a fresh evaluation account before opening its provisioned shell', async () => {
	const db = await createPGliteDatabase();
	try {
		const application = createApplication({
			db: db.database,
			transactionRunner: db.transactionRunner,
			attachmentClaims: new InMemoryAttachmentClaims(),
			openRouterApiKey: 'unused-local-test',
			mistralApiKey: 'unused-local-test',
			overrides: {
				attachmentStorage: new InMemoryAttachmentStorage(),
				modelCatalog: new StubModelCatalog()
			}
		});
		const actor = await seedActor({ db: db.database, controllers: application.controllers });
		const shell = await application.controllers.workspace().getShellContext(actor);
		expect({
			role: shell.user.role,
			projects: shell.projects.map((project) => project.role)
		}).toEqual({ role: 'ADMIN', projects: ['inbox'] });
	} finally {
		await db.close();
	}
}, 30000);
