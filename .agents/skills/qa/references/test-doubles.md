# Fakes and recorders

**What:** Controlled database/API input, or messages the application attempts to send.
**When:** A dependency needs substitution for a fast, repeatable test.
**Type:** Fixtures for unit/integration tests. Use typed handwritten classes or functions.

## The export sends exactly one completion message

### Good — Python

```python
# file: test_recorder_good.py
from pathlib import Path
from export_subject import Recorder, export_addresses

def test_export_sends_one_message(tmp_path: Path) -> None:
    recorder = Recorder()
    export_addresses(["a@example.test", "b@example.test"], tmp_path / "addresses.txt", recorder)
    assert recorder.sent == [b'{"kind":"addresses-exported","count":2}']
```

### Bad — Python

```python
# file: test_recorder_bad.py
from pathlib import Path
from export_subject import Recorder, export_addresses

def test_export_sends_one_message(tmp_path: Path) -> None:
    recorder = Recorder()
    export_addresses(["a@example.test", "b@example.test"], tmp_path / "addresses.txt", recorder)
    assert b'{"kind":"addresses-exported","count":2}' in recorder.sent
```

### Good — TypeScript

```typescript
// file: recorder.good.test.ts
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Recorder, exportAddresses, scenarioDirectory } from './export_subject';

test('export sends one completion message', async () => {
	const recorder = new Recorder();
	await exportAddresses(
		['a@example.test', 'b@example.test'],
		join(await scenarioDirectory(), 'addresses.txt'),
		recorder
	);
	expect(recorder.sent).toEqual(['{"kind":"addresses-exported","count":2}']);
});
```

### Bad — TypeScript

```typescript
// file: recorder.bad.test.ts
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Recorder, exportAddresses, scenarioDirectory } from './export_subject';

test('export sends one completion message', async () => {
	const recorder = new Recorder();
	await exportAddresses(
		['a@example.test', 'b@example.test'],
		join(await scenarioDirectory(), 'addresses.txt'),
		recorder
	);
	expect(recorder.sent).toContain('{"kind":"addresses-exported","count":2}');
});
```

The bad tests pass with duplicate messages. Exact counts/order are appropriate only when required.
For several unordered messages, compare sorted copies while preserving duplicates.

## Setup and limits

Use the exporter/recorder files in [integration setup](integration-testing.md). Keep translation
and serialization real; record the send rather than an internal dispatcher call. Supplying input
with a fake does not justify checking how often it was queried. Fakes cannot prove SQL or provider
compatibility. Required support logs can be checked; developer debug text usually should not be.
Do not cast partial objects, patch private methods, or use mocking libraries.
