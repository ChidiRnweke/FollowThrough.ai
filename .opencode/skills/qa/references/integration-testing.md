# Integration tests

**What:** Workflows that read/write files, use a database, or send messages.
**When:** Testing the pieces separately would miss broken file contents, wiring, or translation.
**Type:** Integration. Run the real workflow and its file/database code. Record outgoing messages.

## Export addresses, then announce success

### Good — Python

```python
# file: test_integration_good.py
from pathlib import Path
import pytest
from export_subject import Recorder, export_addresses

def test_export(tmp_path: Path) -> None:
    path = tmp_path / "addresses.txt"
    recorder = Recorder()

    export_addresses(["a@example.test", "b@example.test"], path, recorder)

    assert path.read_bytes() == b"a@example.test\nb@example.test\n"
    assert recorder.sent == [b'{"kind":"addresses-exported","count":2}']

def test_failed_write_sends_no_success_message(tmp_path: Path) -> None:
    recorder = Recorder()

    with pytest.raises(FileNotFoundError):
        export_addresses(["a@example.test"], tmp_path / "missing" / "addresses.txt", recorder)

    assert recorder.sent == []
```

### Bad — Python

```python
# file: test_integration_bad.py
from pathlib import Path
import pytest
from export_subject import Recorder, export_addresses

def test_export(tmp_path: Path) -> None:
    path = tmp_path / "addresses.txt"
    recorder = Recorder()
    export_addresses(["a@example.test", "b@example.test"], path, recorder)
    assert path.exists()

def test_failed_write(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        export_addresses(["a@example.test"], tmp_path / "missing" / "addresses.txt", Recorder())
```

The bad tests miss incorrect file contents and success messages sent before a failed write.

### Good — TypeScript

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

### Bad — TypeScript

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

Test most rule variations with unit tests. Add integration failure cases for consequences unit
tests cannot establish. A recorder proves attempted messages, not provider acceptance or delivery.

## Runnable setup

Use pytest/Vitest. The fixture writes real temporary files. In the application, import its
workflow and substitute only the outgoing transport. Check provider compatibility separately
against its real test environment when needed.

```python
# file: export_subject.py
import json
from pathlib import Path
from typing import Protocol

class Transport(Protocol):
    def send(self, payload: bytes) -> None: ...

class Recorder:
    def __init__(self) -> None:
        self.sent: list[bytes] = []

    def send(self, payload: bytes) -> None:
        self.sent.append(payload)

def export_addresses(addresses: list[str], destination: Path, transport: Transport) -> None:
    destination.write_text("\n".join(addresses) + "\n", encoding="utf-8")
    payload = json.dumps(
        {"kind": "addresses-exported", "count": len(addresses)},
        separators=(",", ":"),
    ).encode("utf-8")
    transport.send(payload)
```

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
