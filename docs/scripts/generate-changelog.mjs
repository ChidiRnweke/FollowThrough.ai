import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = resolve(docsRoot, '..', 'CHANGELOG.md');
const outputPath = join(docsRoot, 'src', 'content', 'docs', 'releases.md');

const frontmatter = `---
title: Releases
description: Version history of FollowThrough.ai, generated from CHANGELOG.md.
---

`;

let body;
try {
	body = await readFile(changelogPath, 'utf8');
} catch {
	body = null;
}

if (body === null) {
	body = 'No releases yet.';
} else {
	body = body.replace(/^# .+\n+/, '');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, frontmatter + body + '\n');