# Integration testing

Write an integration test when the defect depends on real parts working together, such as
wiring, mapping, persistence, serialization, or dependency failure handling. State the actual
boundary exercised; directory names and class counts do not establish integration evidence.

## Pick the integration scenario

| Risk                                    | Exercise                                                             | Assert                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Parts are wired to the wrong dependency | Normal application construction and a meaningful workflow            | The required result through those real parts                           |
| Values are lost in mapping              | Real adapter with discriminating input values                        | Independently specified mapped result                                  |
| Outbound translation is wrong           | Workflow plus real translation/serialization up to an owned recorder | Exact required payload and contractual cardinality                     |
| Provider contract has drifted           | Real adapter against an appropriate provider test environment        | Provider-accepted behavior; disclose delivery limits                   |
| A dependency failure is misreported     | A valid reproducible failure at the relevant boundary                | Specified failure/recovery and consistent state; no prohibited effects |

## Build the scenario

1. Name the integration risk that a unit test cannot catch.
2. Choose the application workflow that reaches that boundary. Keep participating decisions,
   adapters, and translations real.
3. Classify the dependency surfaces below. Use the real managed dependency; record unmanaged
   outgoing effects at the last owned seam.
4. Establish isolated, production-producible data. Invoke the normal workflow once.
5. Verify managed state with an independent read. Verify the complete relevant external effects
   against independent contract values.
6. Report which dependencies were real and which were substituted.

| Surface   | How to recognize it                                                                  | Evidence                                      |
| --------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| Managed   | The application owns state; other systems do not depend directly on its interactions | Real dependency and resulting state           |
| Unmanaged | Another system or person depends on the emitted interaction                          | Owned recorder and required external contract |

A private application database is normally managed; outbound mail is normally unmanaged. A
shared database can expose both kinds of surface. Out-of-process alone does not determine the
assertion style.

## Python: real file adapter plus outbound contract

Save as `test_export.py`; run `python -m pytest test_export.py`. The example's contract is a
UTF-8 file with one address per line and a final newline, followed by one compact JSON
notification. Only the outgoing transport is substituted. pytest supplies a per-test
[temporary directory](https://docs.pytest.org/en/stable/how-to/tmp_path.html).

```python
import json
from pathlib import Path
from typing import Protocol

import pytest


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


def test_export_writes_the_addresses_and_announces_completion(tmp_path: Path) -> None:
    destination = tmp_path / "addresses.txt"
    recorder = Recorder()

    export_addresses(["a@example.test", "b@example.test"], destination, recorder)

    assert destination.read_bytes() == b"a@example.test\nb@example.test\n"
    assert recorder.sent == [b'{"kind":"addresses-exported","count":2}']


def test_failed_write_does_not_announce_completion(tmp_path: Path) -> None:
    destination = tmp_path / "missing-directory" / "addresses.txt"
    recorder = Recorder()

    with pytest.raises(FileNotFoundError):
        export_addresses(["a@example.test"], destination, recorder)

    assert recorder.sent == []
```

## TypeScript: the same boundary with Vitest

Save as `export.test.ts`; run the project's Vitest command for that file. This is the complete
standalone example, including cleanup. Import your existing workflow in an application test.

```typescript
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';

interface Transport {
	send(payload: string): Promise<void>;
}

class Recorder implements Transport {
	readonly sent: string[] = [];
	async send(payload: string): Promise<void> {
		this.sent.push(payload);
	}
}

async function exportAddresses(addresses: string[], destination: string, transport: Transport) {
	await writeFile(destination, addresses.join('\n') + '\n', 'utf8');
	await transport.send(JSON.stringify({ kind: 'addresses-exported', count: addresses.length }));
}

async function scenarioDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'address-export-'));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	return directory;
}

test('export writes the addresses and announces completion', async () => {
	const destination = join(await scenarioDirectory(), 'addresses.txt');
	const recorder = new Recorder();

	await exportAddresses(['a@example.test', 'b@example.test'], destination, recorder);

	expect(await readFile(destination, 'utf8')).toBe('a@example.test\nb@example.test\n');
	expect(recorder.sent).toEqual(['{"kind":"addresses-exported","count":2}']);
});

test('failed write does not announce completion', async () => {
	const destination = join(await scenarioDirectory(), 'missing-directory', 'addresses.txt');
	const recorder = new Recorder();

	await expect(exportAddresses(['a@example.test'], destination, recorder)).rejects.toMatchObject({
		code: 'ENOENT'
	});

	expect(recorder.sent).toEqual([]);
});
```

**Catches:** dropped addresses, missing newline, incorrect count/payload, duplicate notifications,
and notifying before a failed write. **Bad replacement:** asserting an internal `writeFile`
call or using `JSON.stringify` on the expected side loses independent file/contract evidence.

**Adapt:** choose a real managed adapter for your integration risk, supply valid discriminating
inputs, and record only the outgoing external seam. These examples establish real filesystem
behavior and attempted notification contents; they do not establish transport delivery.
The cleanup hook follows [Vitest test context](https://vitest.dev/guide/test-context.html).

## Select more cases by the boundary risk

Start with a successful path that crosses the participating boundaries. Add another path when
it exercises a different integration assumption: constraints, mapping, transaction failure,
read filtering, or recovery. Keep most business-rule combinations in unit tests.

For failure cases, assert the required failure result and consistent remaining state, plus
absence of effects the failed operation must not emit. A happy path cannot establish rollback.
See [Database testing](database-testing.md).

Do not duplicate every unit scenario through expensive setup or impose a one-happy-path quota.
A failure may need no extra integration test when it is immediate, obvious on normal execution,
already protected at an adequate level, and cannot silently corrupt data. Recoverable, delayed,
and persistence-integrity failures need their own assessment.

## If the environment is unavailable

Run useful narrower tests and report the missing evidence. A fake-backed workflow can verify
application decisions, but does not replace the real integration. Do not manufacture a passing
default or claim persistence compatibility from a fake. Avoid building elaborate private-store
mocks to conceal unavailable infrastructure.

Follow the project's accepted architecture and interfaces. Favor explicit dependencies and
limited indirection; an interface does not eliminate a runtime cycle. Do not force a particular
layer count or remove established repository contracts to match these examples.
