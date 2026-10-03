# End-to-end testing

Use a public user or API entry point when startup, composition, routing, deployment, or a
complete critical workflow adds evidence that narrower tests cannot supply. A browser is not
required for an API workflow.

## Write the workflow

1. Select one important user goal and the specific failure the public boundary can reveal.
2. Establish valid isolated data and the dependencies needed for that evidence. Record any
   substituted external service; a recorder does not prove delivery by that provider.
3. Perform the goal through the public application, rather than invoking its internal helpers.
4. Assert the user-visible result through the application's normal read path. Observe external
   effects where their required contract is visible.
5. Make cleanup and failure diagnostics reliable across interrupted runs. Run the workflow in
   the project's intended environment and report its actual scope.

## TypeScript: exercise a public HTTP write and read

Save as `notes.e2e.test.ts` and run with Vitest in a Node environment. This standalone example
includes a real loopback HTTP application and a fresh state/lifecycle fixture. It proves the
public HTTP workflow; its in-memory application storage does not prove database integration.

```typescript
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, test as base } from 'vitest';

const test = base.extend<{ baseUrl: string }>({
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

test('a saved title is returned through the public read path', async ({ baseUrl }) => {
	const saved = await fetch(`${baseUrl}/notes/note-1`, {
		method: 'POST',
		body: 'Quarterly review'
	});
	await saved.text(); // Consume the response body before releasing the connection.

	const read = await fetch(`${baseUrl}/notes/note-1`);

	expect(saved.status).toBe(201);
	expect(read.status).toBe(200);
	expect(await read.json()).toEqual({ id: 'note-1', title: 'Quarterly review' });
});
```

**Catches:** a broken write route, wrong status, or a read path that does not return the saved
value. **Bad replacement:** asserting an internal map contains the title bypasses routing,
HTTP, and the public read path.

**Adapt:** replace the toy server fixture with the real application launcher or test deployment.
Keep the same public write/read assertions, use the actual auth/data fixtures, and disclose
substituted providers. Invoke the application's existing entry points rather than adding test
routes. For browser goals, perform the same write/read through visible controls as shown in
[Frontend testing](frontend-testing.md). Diagnose with private storage inspection if needed,
but retain public observations as the workflow's assertions.

Keep the set focused on distinct critical goals. One or two broad workflows can be a useful
starting point, not a maximum. Do not repeat every business-rule variation at the slowest layer
or enforce a pyramid ratio. CRUD-heavy systems may need mostly integration tests; for a small
API, public workflow checks may cost little more than in-process integration checks.

Prefer one goal per test. A naturally sequential workflow can justify several acts when splitting
has exceptional real dependency cost; document that reason. Do not combine independent goals
just to reuse setup. Put expensive checks after faster feedback when appropriate to the project's
delivery process. Wider scope does not excuse brittle internal assertions or uncontrolled data.
