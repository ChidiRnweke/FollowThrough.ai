# End-to-end tests

**What:** An important task completed through the application's public UI or API.
**When:** Routing, authentication, startup, or connections between features could break that task.
**Type:** End-to-end. Keep detailed rule variations in unit tests.

## Save a note, then retrieve it through the public API

### Good — TypeScript

```typescript
// file: http.good.test.ts
import { expect } from 'vitest';
import { test } from './http_fixture';

test('saved title can be retrieved', async ({ baseUrl }) => {
	const saved = await fetch(`${baseUrl}/notes/note-1`, {
		method: 'POST',
		body: 'Quarterly review'
	});
	await saved.text();

	const read = await fetch(`${baseUrl}/notes/note-1`);

	expect(saved.status).toBe(201);
	expect(read.status).toBe(200);
	expect(await read.json()).toEqual({ id: 'note-1', title: 'Quarterly review' });
});
```

### Bad — TypeScript

```typescript
// file: http.bad.test.ts
import { expect } from 'vitest';
import { test } from './http_fixture';

test('saved title can be retrieved', async ({ baseUrl }) => {
	const saved = await fetch(`${baseUrl}/notes/note-1`, {
		method: 'POST',
		body: 'Quarterly review'
	});
	await saved.text();
	expect(saved.status).toBe(201);
});
```

The bad test passes if the write returns success but stores the wrong title. For browser journeys,
create/save through the UI and reopen through the application's normal read path.

## Runnable setup

Use Vitest in Node. This fixture starts a real HTTP server with fresh data per test. Its storage
is just the example application's data: it does not prove database behavior. In a project,
replace the fixture with the actual application launcher or deployment and its auth/data setup.

```typescript
// file: http_fixture.ts
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test as base } from 'vitest';

export const test = base.extend<{ baseUrl: string }>({
	baseUrl: async ({}, use) => {
		let savedTitle = '';
		const server = createServer(async (request, response) => {
			if (request.url !== '/notes/note-1') {
				response.writeHead(404).end();
				return;
			}
			if (request.method === 'POST') {
				let title = '';
				for await (const chunk of request) title += chunk.toString();
				savedTitle = title;
				response.writeHead(201, { 'Content-Type': 'application/json' });
				response.end(JSON.stringify({ id: 'note-1', title: savedTitle }));
			} else if (request.method === 'GET') {
				response.setHeader('Content-Type', 'application/json');
				response.end(JSON.stringify({ id: 'note-1', title: savedTitle }));
			} else {
				response.writeHead(405).end();
			}
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('TCP address required');
			await use(`http://127.0.0.1:${address.port}`);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
	}
});
```

Keep a small set of distinct important journeys, not every unit-test case repeated through a
browser. CRUD applications can need more integration tests than unit tests; no fixed suite ratio
is required. Several steps can check one journey. Disclose substituted providers and missing
infrastructure. A passing example server is not verification of a real application's deployment.
