import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { config as loadDotenv } from 'dotenv';
import { TOOL_CATALOG } from '../src/lib/models/agent/tool-catalog.ts';

const embeddingModel = process.env.EVAL_EMBEDDING_MODEL ?? 'openai/text-embedding-3-large';
const toolEmbeddingText = (entry: (typeof TOOL_CATALOG)[number]): string =>
	`${entry.name}: ${entry.retrievalText ?? entry.description}`;

const cachePath = new URL('../src/evals/fixtures/auxiliary-cache.json', import.meta.url);
const entries = JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, unknown>;
const keyFor = (content: string): string => {
	const payload = JSON.stringify({ model: embeddingModel, content });
	const hash = createHash('sha256').update(payload).digest('hex');
	return `embed:${hash.slice(0, 32)}`;
};
const missing = TOOL_CATALOG.map(toolEmbeddingText)
	.map((content) => ({ content, key: keyFor(content) }))
	.filter(({ key }) => !(key in entries));

if (missing.length > 0 && process.argv.includes('--record-missing')) {
	loadDotenv({ quiet: true });
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is required to record missing embeddings.');
	const client = new OpenAI({
		apiKey,
		baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
		timeout: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000)
	});
	const response = await client.embeddings.create({
		model: embeddingModel,
		input: missing.map(({ content }) => content)
	});
	const vectors = [...response.data].sort((left, right) => left.index - right.index);
	for (const [index, item] of missing.entries()) {
		const vector = vectors[index]?.embedding;
		if (!vector) throw new Error(`Provider omitted embedding ${index} for ${item.content}`);
		entries[item.key] = Buffer.from(new Float32Array(vector).buffer).toString('base64');
	}
	await writeFile(cachePath, JSON.stringify(entries), 'utf8');
	process.stdout.write(`Recorded ${missing.length} deterministic tool embeddings.\n`);
} else if (missing.length > 0) {
	process.stderr.write(
		`Missing ${missing.length} deterministic tool embedding cache entries:\n${missing.map(({ content }) => `- ${content}`).join('\n')}\n`
	);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`Eval cache contains all ${TOOL_CATALOG.length} deterministic tool embeddings.\n`
	);
}
