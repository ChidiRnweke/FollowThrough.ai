import { access, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import postgres from 'postgres';
import { mintSession } from '../tests/auth.setup.ts';
import {
	resetShowcase,
	seedShowcase,
	showcaseModel,
	SHOWCASE_USER_ID
} from './capture-screenshots/showcase.ts';
import { beatIds, beats, type FilmState } from './capture-video/beats.ts';
import { AudioGenerator, type AudioManifest } from './capture-video/audio.ts';
import { audioScript, filmCues, writeFilm } from './capture-video/film.ts';
import type { FilmManifest } from './capture-video/manifest.ts';
import { ClipRecorder, Hand, run, type ClipRecord } from './capture-video/recorder.ts';
import { RunReplay } from './capture-video/replay.ts';

/**
 * Record the README walkthrough as a film of the real app, then compose it with HyperFrames.
 *
 *     pnpm dev                 # with the real .env, as for docs:screenshots
 *     pnpm docs:video          # or: pnpm docs:video --base-url http://127.0.0.1:5183 --skip-render
 *     pnpm docs:video --compose-only   # rebuild the film from the last recording
 *
 * The run seeds the showcase workspace, signs in as the showcase user and plays the five beats in
 * one browser session at 1920×1080, dark, captured at twice that in device pixels. The agent's
 * turns are replayed through the real run stream from the walkthrough's scripted transcript, so
 * the chat streams without a model being called. Clips, the pointer log and the beat marks land
 * in `artifacts/video/`; the composition is written into `scripts/capture-video/film/` from them
 * and renders `artifacts/video/walkthrough-dark.mp4`.
 */

const { values: options } = parseArgs({
	options: {
		'base-url': { type: 'string', default: 'http://127.0.0.1:5173' },
		'skip-render': { type: 'boolean', default: false },
		/** Rebuild the composition from the last recording's manifest instead of recording. */
		'compose-only': { type: 'boolean', default: false },
		/** Compose a silent film: no ElevenLabs calls, no narration, music or effects. */
		'no-audio': { type: 'boolean', default: false },
		cleanup: { type: 'boolean', default: false }
	}
});

const baseUrl = options['base-url'];
const output = new URL('../artifacts/video/', import.meta.url);
const manifestFile = new URL('manifest.json', output);
const film = new URL('./capture-video/film/', import.meta.url);
const mark = new URL('../static/icons/followthrough.svg', import.meta.url);
const audioOutput = new URL('audio/', output);
/** The film project's own HyperFrames CLI, a devDependency of `scripts/capture-video/film`. */
const hyperframes = new URL('node_modules/.bin/hyperframes', film).pathname;
/** The copy the README and the docs site read, small enough to live in the repository. */
const published = new URL('../static/product-video/', import.meta.url);
const PUBLISHED_LIMIT = 10 * 1024 * 1024;
const viewport = { width: 1920, height: 1080 } as const;
const scale = 2;
const fps = 30;

const record = async (): Promise<FilmManifest> => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the showcase workspace.');
	const sql = postgres(databaseUrl, { max: 1 });
	// A real device scale factor, not an emulated one: the screencast delivers frames at the
	// browser's own scale, so this is what makes the captured frames 3840×2160.
	const browser = await chromium.launch({ args: [`--force-device-scale-factor=${scale}`] });
	try {
		await resetShowcase(sql);
		const token = await mintSession(sql, SHOWCASE_USER_ID);
		const cookie = { name: 'session', value: token, domain: new URL(baseUrl).hostname, path: '/' };

		const seeding = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await seeding.addCookies([cookie]);
		const seedPage = await seeding.newPage();
		await seedPage.goto(`${baseUrl}/today`);
		await seedPage.getByRole('heading', { name: 'Today', exact: true }).waitFor();
		// Kept open: the replayed create_note call imports the release plan through this page.
		const ids = await seedShowcase(sql, seedPage, baseUrl, browser);

		const context = await browser.newContext({
			viewport,
			deviceScaleFactor: scale,
			colorScheme: 'dark'
		});
		await context.addCookies([cookie]);
		await context.addInitScript(() => localStorage.setItem('mode-watcher-mode', 'dark'));
		// Proofreading is the app's own: its marks would underline every invented name in the
		// seed. Spellcheck is the browser's; the attribute is inherited from the root.
		await context.addInitScript(() => {
			localStorage.setItem('followthrough.proofreading.enabled', 'false');
			document.addEventListener('DOMContentLoaded', () =>
				document.documentElement.setAttribute('spellcheck', 'false')
			);
		});
		const page = await context.newPage();
		await mkdir(output, { recursive: true });
		const recorder = new ClipRecorder(page, {
			output,
			width: viewport.width * scale,
			height: viewport.height * scale,
			fps,
			quality: 95
		});
		const beatContext = {
			page,
			hand: new Hand(page, recorder, { x: 24, y: viewport.height - 24 }),
			recorder,
			replay: new RunReplay(sql, { delta: 28, call: 1100 }),
			sql,
			ids,
			userId: SHOWCASE_USER_ID,
			model: showcaseModel(),
			baseUrl
		};
		const state: FilmState = {};
		const clips: (ClipRecord & { readonly caption: string })[] = [];
		for (const id of beatIds) {
			const beat = beats[id];
			await beat.prepare(beatContext, state);
			await recorder.begin(id);
			try {
				await beat.act(beatContext, state);
			} catch (error) {
				const failure = new URL(`failure-${id}.png`, output);
				await page.screenshot({ path: failure.pathname });
				throw new Error(`The "${id}" beat failed. The page is in ${failure.pathname}.`, {
					cause: error
				});
			}
			const clip = await recorder.end();
			clips.push({ ...clip, caption: beat.caption });
			process.stdout.write(
				`${new URL(clip.file, output).pathname} (${clip.duration.toFixed(1)}s)\n`
			);
		}
		const manifest: FilmManifest = {
			recordedAt: new Date().toISOString(),
			viewport,
			scale,
			fps,
			clips
		};
		await writeFile(manifestFile, `${JSON.stringify(manifest, null, '\t')}\n`);
		await context.close();
		await seeding.close();
		if (options.cleanup) await sql`delete from users where id = ${SHOWCASE_USER_ID}`;
		return manifest;
	} finally {
		await browser.close();
		await sql.end();
	}
};

const compose = async (manifest: FilmManifest): Promise<void> => {
	const clips = new URL('assets/clips/', film);
	await mkdir(clips, { recursive: true });
	for (const clip of manifest.clips)
		await cp(new URL(clip.file, output), new URL(clip.file, clips));
	const cues = filmCues(manifest);
	let audio: AudioManifest | undefined;
	if (!options['no-audio']) {
		audio = await new AudioGenerator(audioOutput).generate(audioScript(cues));
		const sounds = new URL('assets/audio/', film);
		await mkdir(sounds, { recursive: true });
		const files = [...Object.values(audio.narration), audio.music, audio.click, audio.typing];
		for (const clip of files) await cp(new URL(clip.file, audioOutput), new URL(clip.file, sounds));
	}
	await writeFilm(manifest, film, mark, cues, audio);
	process.stdout.write(`${new URL('index.html', film).pathname}\n`);
};

const render = async (): Promise<void> => {
	try {
		await access(hyperframes);
	} catch {
		await run('pnpm', ['--dir', film.pathname, 'install', '--frozen-lockfile']);
	}
	await run(hyperframes, ['check'], film.pathname);
	const target = new URL('walkthrough-dark.mp4', output).pathname;
	await run(hyperframes, ['render', '--quality', 'delivery', '--output', target], film.pathname);
	process.stdout.write(`${target}\n`);
};

/**
 * The published copy: a web encode under GitHub's 10 MB video limit, and a poster from the
 * moment the simulator has landed in the note, which the README and the docs page show.
 */
const publish = async (manifest: FilmManifest): Promise<void> => {
	await mkdir(published, { recursive: true });
	const source = new URL('walkthrough-dark.mp4', output).pathname;
	const video = new URL('walkthrough.mp4', published).pathname;
	await run('ffmpeg', [
		'-y',
		'-loglevel',
		'error',
		'-i',
		source,
		'-c:v',
		'libx264',
		'-crf',
		'24',
		'-preset',
		'slow',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'aac',
		'-b:a',
		'128k',
		'-movflags',
		'+faststart',
		video
	]);
	const { size } = await stat(video);
	if (size > PUBLISHED_LIMIT)
		throw new Error(
			`${video} is ${(size / 1024 / 1024).toFixed(1)} MB, over the 10 MB GitHub shows inline. Raise the CRF by hand.`
		);
	let at = 0;
	for (const clip of manifest.clips) {
		const embedded = clip.marks.find((mark) => mark.name === 'embedded');
		if (embedded) {
			at += embedded.t + 1.2;
			break;
		}
		at += clip.duration;
	}
	await run('ffmpeg', [
		'-y',
		'-loglevel',
		'error',
		'-ss',
		at.toFixed(3),
		'-i',
		source,
		'-frames:v',
		'1',
		'-q:v',
		'4',
		new URL('walkthrough-poster.jpg', published).pathname
	]);
	process.stdout.write(`${video} (${(size / 1024 / 1024).toFixed(1)} MB)\n`);
};

const manifest: FilmManifest = options['compose-only']
	? JSON.parse(await readFile(manifestFile, 'utf8'))
	: await record();
await compose(manifest);
if (!options['skip-render']) {
	await render();
	await publish(manifest);
}
