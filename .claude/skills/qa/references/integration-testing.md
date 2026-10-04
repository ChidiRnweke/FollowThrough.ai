# Integration tests

**What:** Workflows that read/write files, use a database, or send messages.
**When:** Separate tests would miss broken contents, wiring, or translation.
**Type:** Integration. Run the real workflow and file/database code. Record outgoing messages.

## Export addresses, then announce success

The export must write both addresses, each followed by a newline, and announce the number
exported. If writing fails, it must send no success message. Check the file's contents and
recorded messages after running the workflow; file existence and an exception are insufficient.

### Bad — checks only file existence and the error

```typescript
// file: integration.bad.test.ts
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Recorder, exportAddresses, scenarioDirectory } from './export_subject';

test('export creates a file', async () => {
	const path = join(await scenarioDirectory(), 'addresses.txt');
	await exportAddresses(['a@example.test', 'b@example.test'], path, new Recorder());
	expect((await stat(path)).isFile()).toBe(true);
});

test('failed write rejects', async () => {
	const path = join(await scenarioDirectory(), 'missing', 'addresses.txt');
	await expect(exportAddresses(['a@example.test'], path, new Recorder())).rejects.toMatchObject({
		code: 'ENOENT'
	});
});
```

An empty or incorrectly formatted file still exists. Sending success before attempting a
failed write still produces the expected exception. These assertions miss both bugs.

### Solution — check contents and success/failure messages

```typescript
// file: integration.good.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Recorder, exportAddresses, scenarioDirectory } from './export_subject';

test('export writes addresses and announces success', async () => {
	const path = join(await scenarioDirectory(), 'addresses.txt');
	const recorder = new Recorder();

	await exportAddresses(['a@example.test', 'b@example.test'], path, recorder);

	expect(await readFile(path, 'utf8')).toBe('a@example.test\nb@example.test\n');
	expect(recorder.sent).toEqual(['{"kind":"addresses-exported","count":2}']);
});

test('failed write sends no success message', async () => {
	const path = join(await scenarioDirectory(), 'missing', 'addresses.txt');
	const recorder = new Recorder();

	await expect(exportAddresses(['a@example.test'], path, recorder)).rejects.toMatchObject({
		code: 'ENOENT'
	});

	expect(recorder.sent).toEqual([]);
});
```

The exact text catches a missing newline. The empty message list catches premature success.
Test most rule variations with unit tests; add integration failures for consequences those tests
cannot establish. A recorder proves attempted messages, not provider acceptance or delivery.

## Runnable setup

Use Vitest. This fixture writes real temporary files and removes only its own directory.
In an application, import its workflow and substitute only the outgoing transport. Check provider
compatibility separately against its real test environment when needed.

```typescript
// file: export_subject.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

interface Transport {
	send(payload: string): Promise<void>;
}

export class Recorder implements Transport {
	readonly sent: string[] = [];
	async send(payload: string): Promise<void> {
		this.sent.push(payload);
	}
}

export async function exportAddresses(
	addresses: string[],
	destination: string,
	transport: Transport
) {
	await writeFile(destination, addresses.join('\n') + '\n', 'utf8');
	await transport.send(JSON.stringify({ kind: 'addresses-exported', count: addresses.length }));
}

export async function scenarioDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'address-export-'));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	return directory;
}
```
