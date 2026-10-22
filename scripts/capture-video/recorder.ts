import { spawn } from 'node:child_process';
import { link, mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { CDPSession, Locator, Page } from '@playwright/test';

/** Where the pointer was, in CSS pixels of the recorded page, `t` seconds into the clip. */
export interface CursorSample {
	readonly t: number;
	readonly x: number;
	readonly y: number;
	readonly kind: 'move' | 'down' | 'up';
}

/** A moment the composition can cut or caption on, `t` seconds into the clip. */
export interface ClipMark {
	readonly name: string;
	readonly t: number;
}

export interface ClipRecord {
	readonly beat: string;
	/** The clip's file name inside the clips folder. */
	readonly file: string;
	readonly duration: number;
	readonly frames: number;
	readonly marks: readonly ClipMark[];
	readonly cursor: readonly CursorSample[];
}

export interface RecorderSettings {
	/** Where clips and their frame folders are written. */
	readonly output: URL;
	/** Device pixels of the captured frames: the viewport times its scale factor. */
	readonly width: number;
	readonly height: number;
	/** Frames per second of the encoded clip. */
	readonly fps: number;
	/** JPEG quality of each captured frame. */
	readonly quality: number;
}

interface ScreencastFrame {
	readonly data: string;
	readonly metadata: { readonly timestamp?: number };
	readonly sessionId: number;
}

/**
 * Records a page through Chromium's screencast at device resolution, one JPEG per repaint, and
 * encodes each beat into a constant-frame-rate clip with ffmpeg. The screencast delivers a frame
 * only when something changed, so each frame is held until the next one; the clock is Chromium's
 * own frame timestamp, and the pointer log and marks use the same clock.
 */
export class ClipRecorder {
	private session: CDPSession | undefined;
	private beat = '';
	private started = 0;
	private frames: { readonly t: number; readonly file: string }[] = [];
	private readonly writes: Promise<void>[] = [];
	private cursor: CursorSample[] = [];
	private marks: ClipMark[] = [];

	constructor(
		private readonly page: Page,
		private readonly settings: RecorderSettings
	) {}

	/** Seconds since the current clip began. */
	now(): number {
		return Date.now() / 1000 - this.started;
	}

	private framesDir(beat: string): URL {
		return new URL(`frames/${beat}/`, this.settings.output);
	}

	async begin(beat: string): Promise<void> {
		if (this.session) throw new Error(`The recorder is still recording "${this.beat}".`);
		this.beat = beat;
		this.frames = [];
		this.cursor = [];
		this.marks = [];
		const dir = this.framesDir(beat);
		await rm(dir, { recursive: true, force: true });
		await mkdir(dir, { recursive: true });
		const session = await this.page.context().newCDPSession(this.page);
		this.session = session;
		this.started = Date.now() / 1000;
		session.on('Page.screencastFrame', (frame: ScreencastFrame) => {
			const index = this.frames.length;
			const file = new URL(`${String(index).padStart(6, '0')}.jpg`, dir);
			const t = (frame.metadata.timestamp ?? Date.now() / 1000) - this.started;
			this.frames.push({ t: Math.max(0, t), file: file.pathname });
			this.writes.push(writeFile(file, Buffer.from(frame.data, 'base64')));
			void session.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
		});
		await session.send('Page.startScreencast', {
			format: 'jpeg',
			quality: this.settings.quality,
			maxWidth: this.settings.width,
			maxHeight: this.settings.height,
			everyNthFrame: 1
		});
	}

	mark(name: string): void {
		this.marks.push({ name, t: this.now() });
	}

	pointer(kind: CursorSample['kind'], x: number, y: number): void {
		this.cursor.push({ t: this.now(), x, y, kind });
	}

	/** Stop the screencast and encode the clip. */
	async end(): Promise<ClipRecord> {
		const session = this.session;
		if (!session) throw new Error('The recorder is not recording.');
		// Hold the last state for a moment so the final frame has a duration.
		await sleep(250);
		const duration = this.now();
		await session.send('Page.stopScreencast');
		await session.detach();
		this.session = undefined;
		await Promise.all(this.writes);
		this.writes.length = 0;
		if (this.frames.length === 0) throw new Error(`The "${this.beat}" beat produced no frames.`);
		const file = `${this.beat}.mp4`;
		await this.encode(new URL(file, this.settings.output).pathname, duration);
		await rm(this.framesDir(this.beat), { recursive: true, force: true });
		return {
			beat: this.beat,
			file,
			duration,
			frames: this.frames.length,
			marks: this.marks,
			cursor: this.cursor
		};
	}

	/**
	 * Lay the captured frames on a constant frame grid, each frame held until the next one
	 * arrived, and encode the grid. Hard links keep the grid free: no frame is copied.
	 */
	private async encode(output: string, duration: number): Promise<void> {
		const grid = new URL('grid/', this.framesDir(this.beat));
		await mkdir(grid, { recursive: true });
		const total = Math.max(1, Math.round(duration * this.settings.fps));
		let index = 0;
		for (let frame = 0; frame < total; frame += 1) {
			const at = frame / this.settings.fps;
			while (index + 1 < this.frames.length && (this.frames[index + 1]?.t ?? Infinity) <= at)
				index += 1;
			const source = this.frames[index];
			if (!source) throw new Error('The frame grid ran out of captured frames.');
			await link(source.file, new URL(`${String(frame).padStart(6, '0')}.jpg`, grid).pathname);
		}
		await run('ffmpeg', [
			'-y',
			'-loglevel',
			'error',
			'-framerate',
			String(this.settings.fps),
			'-i',
			new URL('%06d.jpg', grid).pathname,
			'-vf',
			'format=yuv420p',
			'-c:v',
			'libx264',
			'-preset',
			'veryfast',
			'-crf',
			'12',
			'-movflags',
			'+faststart',
			output
		]);
	}
}

/** Run a command to completion, failing on a non-zero exit. */
export const run = (command: string, args: readonly string[], cwd?: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit', cwd });
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} ${args.join(' ')} exited with ${code}.`));
		});
	});

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The reader's hand: moves, clicks, drags and types at a human pace, and tells the recorder where
 * the pointer is, since headless Chromium paints no cursor. The composition draws it from the
 * log, so its click always lands on the frame the page reacts to.
 */
export class Hand {
	private x: number;
	private y: number;

	constructor(
		private readonly page: Page,
		private readonly recorder: ClipRecorder,
		start: { readonly x: number; readonly y: number }
	) {
		this.x = start.x;
		this.y = start.y;
	}

	/** Put the pointer at its resting place and log it, so a clip starts with a known cursor. */
	async rest(): Promise<void> {
		await this.page.mouse.move(this.x, this.y);
		this.recorder.pointer('move', this.x, this.y);
	}

	pause(ms: number): Promise<void> {
		return sleep(ms);
	}

	/** Glide to a point: longer moves take longer, up to the given duration. */
	async glide(x: number, y: number, duration = 650): Promise<void> {
		const distance = Math.hypot(x - this.x, y - this.y);
		const ms = Math.min(duration, Math.max(220, distance * 0.9));
		const steps = Math.max(8, Math.round(ms / 16));
		const [fromX, fromY] = [this.x, this.y];
		for (let step = 1; step <= steps; step += 1) {
			const k = easeInOut(step / steps);
			this.x = fromX + (x - fromX) * k;
			this.y = fromY + (y - fromY) * k;
			await this.page.mouse.move(this.x, this.y);
			this.recorder.pointer('move', this.x, this.y);
			await sleep(16);
		}
	}

	private async center(target: Locator): Promise<{ x: number; y: number }> {
		await target.scrollIntoViewIfNeeded();
		const box = await target.boundingBox();
		if (!box) throw new Error('The target has no box to point at.');
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	}

	/**
	 * Scroll a point of the page towards the middle of the viewport with the wheel, as far as
	 * the content allows: near the end of a document the target stops short of the middle.
	 */
	async scrollTo(target: Locator): Promise<void> {
		const viewport = this.page.viewportSize();
		if (!viewport) throw new Error('The page has no viewport to scroll in.');
		await this.glide(viewport.width / 2, viewport.height / 2, 400);
		let previous: number | undefined;
		for (let step = 0; step < 200; step += 1) {
			const box = await target.boundingBox();
			if (!box) throw new Error('The scroll target has no box.');
			const centre = box.y + box.height / 2;
			const offset = centre - viewport.height * 0.45;
			if (Math.abs(offset) < 40 || previous === centre) return;
			previous = centre;
			await this.page.mouse.wheel(0, Math.sign(offset) * Math.min(Math.abs(offset), 160));
			await sleep(24);
		}
		throw new Error('The scroll target never reached the viewport.');
	}

	async hover(target: Locator): Promise<void> {
		const { x, y } = await this.center(target);
		await this.glide(x, y);
	}

	async click(target: Locator): Promise<void> {
		await this.hover(target);
		await sleep(140);
		await this.press();
	}

	/** Press and release where the pointer is. */
	private async press(): Promise<void> {
		await this.page.mouse.down();
		this.recorder.pointer('down', this.x, this.y);
		await sleep(90);
		await this.page.mouse.up();
		this.recorder.pointer('up', this.x, this.y);
	}

	/** Select a line of text by dragging across it, as a reader does before using the toolbar. */
	async selectLine(target: Locator): Promise<void> {
		await target.scrollIntoViewIfNeeded();
		const box = await target.boundingBox();
		if (!box) throw new Error('The text has no box to select.');
		const y = box.y + box.height / 2;
		await this.glide(box.x + 2, y);
		await sleep(160);
		await this.page.mouse.down();
		this.recorder.pointer('down', this.x, this.y);
		await this.glide(box.x + box.width - 2, y, 900);
		await sleep(120);
		await this.page.mouse.up();
		this.recorder.pointer('up', this.x, this.y);
	}

	/** Drag a slider thumb by `units` steps of its range. */
	async dragSlider(thumb: Locator, units: number): Promise<void> {
		const root = thumb.locator('xpath=ancestor::*[@data-slot="slider"]').first();
		const [track, min, max] = await Promise.all([
			root.boundingBox(),
			thumb.getAttribute('aria-valuemin'),
			thumb.getAttribute('aria-valuemax')
		]);
		if (!track || min === null || max === null)
			throw new Error('The slider has no track or range to drag along.');
		const perUnit = track.width / (Number(max) - Number(min));
		const { x, y } = await this.center(thumb);
		await this.glide(x, y);
		await sleep(180);
		await this.page.mouse.down();
		this.recorder.pointer('down', this.x, this.y);
		await this.glide(x + units * perUnit, y, 1100);
		await sleep(200);
		await this.page.mouse.up();
		this.recorder.pointer('up', this.x, this.y);
	}

	/** Type like a person: uneven key delays, a breath after punctuation. */
	async type(text: string): Promise<void> {
		const characters = [...text];
		for (const [index, character] of characters.entries()) {
			await this.page.keyboard.type(character);
			const jitter = [22, 38, 26, 44, 30, 20, 35][index % 7] ?? 30;
			const breath = /[,.]/.test(character) ? 170 : character === ' ' && index % 5 === 0 ? 30 : 0;
			await sleep(jitter + breath);
		}
	}
}
