import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

/**
 * The film's sound, generated once with ElevenLabs and cached by request: the narrator's
 * lines, a music bed and the two effects the composition places on the pointer's clicks and
 * the hand's typing. The client reads `ELEVENLABS_API_KEY` from the environment, which
 * `pnpm docs:video` loads from `.env.local`; the key is never in code.
 */

/** One spoken line, keyed by the cue it belongs to. */
export interface NarrationLine {
	readonly id: string;
	readonly text: string;
}

export interface AudioScript {
	readonly narration: readonly NarrationLine[];
	readonly music: { readonly prompt: string; readonly lengthMs: number };
	readonly click: string;
	readonly typing: string;
}

/** A generated file, relative to the audio folder, with its measured length. */
export interface GeneratedClip {
	readonly file: string;
	readonly duration: number;
}

export interface AudioManifest {
	readonly narration: Readonly<Record<string, GeneratedClip>>;
	readonly music: GeneratedClip;
	readonly click: GeneratedClip;
	readonly typing: GeneratedClip;
}

/** George: a narrative voice. One place to change it. */
const VOICE = 'JBFqnCBsd6RMkjVDRZzb';
const SPEECH_MODEL = 'eleven_v4';
const MUSIC_MODEL = 'music_v2_5';

const hash = (request: Readonly<Record<string, string | number | boolean>>): string =>
	createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 16);

/** The length of an audio file, from ffprobe. */
const probe = (path: string): Promise<number> =>
	new Promise((resolve, reject) => {
		const child = spawn('ffprobe', [
			'-v',
			'error',
			'-show_entries',
			'format=duration',
			'-of',
			'csv=p=0',
			path
		]);
		let out = '';
		child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
		child.on('error', reject);
		child.on('exit', (code) => {
			const duration = Number(out.trim());
			if (code === 0 && Number.isFinite(duration)) resolve(duration);
			else reject(new Error(`ffprobe could not read the length of ${path}.`));
		});
	});

const bytes = async (stream: ReadableStream<Uint8Array>): Promise<Buffer> =>
	Buffer.from(await new Response(stream).arrayBuffer());

/**
 * Generates what the script asks for, unless the same request was generated before: each file
 * is named by a hash of its request, so composing the film again costs nothing.
 */
export class AudioGenerator {
	private readonly client: ElevenLabsClient;

	constructor(private readonly output: URL) {
		if (!process.env.ELEVENLABS_API_KEY)
			throw new Error(
				'ELEVENLABS_API_KEY is not set. Run `npx -y @elevenlabs/cli@latest onboard init` in the repository, or compose with --no-audio.'
			);
		this.client = new ElevenLabsClient();
	}

	async generate(script: AudioScript): Promise<AudioManifest> {
		await mkdir(this.output, { recursive: true });
		const narration: Record<string, GeneratedClip> = {};
		for (const line of script.narration) narration[line.id] = await this.speak(line);
		return {
			narration,
			music: await this.compose(script.music),
			click: await this.effect('click', script.click, { duration: 0.6, loop: false }),
			// Long enough for the longest prompt the hand types; a span is cut to its own length.
			typing: await this.effect('typing', script.typing, { duration: 14, loop: true })
		};
	}

	/** The clip for a request generated before, or `undefined` when its file is not there. */
	private async cached(file: string): Promise<GeneratedClip | undefined> {
		try {
			await access(new URL(file, this.output));
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
			throw error;
		}
		return { file, duration: await probe(new URL(file, this.output).pathname) };
	}

	private async keep(file: string, audio: Buffer): Promise<GeneratedClip> {
		const path = new URL(file, this.output);
		await writeFile(path, audio);
		const duration = await probe(path.pathname);
		process.stdout.write(`${path.pathname} (${duration.toFixed(2)}s)\n`);
		return { file, duration };
	}

	private async speak(line: NarrationLine): Promise<GeneratedClip> {
		const file = `voice-${line.id}-${hash({ text: line.text, voice: VOICE, model: SPEECH_MODEL })}.mp3`;
		const cached = await this.cached(file);
		if (cached) return cached;
		const spoken = await this.client.textToSpeech.convertWithTimestamps(VOICE, {
			text: line.text,
			modelId: SPEECH_MODEL,
			voiceSettings: { stability: 0.5, similarityBoost: 0.75 }
		});
		if (!spoken.alignment?.characterEndTimesSeconds?.length)
			throw new Error(`ElevenLabs returned no timing for the "${line.id}" line.`);
		return this.keep(file, Buffer.from(spoken.audioBase64, 'base64'));
	}

	private async compose(music: AudioScript['music']): Promise<GeneratedClip> {
		const file = `music-${hash({ prompt: music.prompt, length: music.lengthMs, model: MUSIC_MODEL })}.mp3`;
		const cached = await this.cached(file);
		if (cached) return cached;
		const audio = await bytes(
			await this.client.music.compose({
				prompt: music.prompt,
				musicLengthMs: music.lengthMs,
				modelId: MUSIC_MODEL,
				forceInstrumental: true
			})
		);
		return this.keep(file, audio);
	}

	private async effect(
		name: string,
		text: string,
		options: { readonly duration: number; readonly loop: boolean }
	): Promise<GeneratedClip> {
		const file = `sfx-${name}-${hash({ text, ...options })}.mp3`;
		const cached = await this.cached(file);
		if (cached) return cached;
		const audio = await bytes(
			await this.client.textToSoundEffects.convert({
				text,
				durationSeconds: options.duration,
				promptInfluence: 0.8,
				loop: options.loop
			})
		);
		return this.keep(file, audio);
	}
}
