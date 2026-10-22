import { cp, mkdir, writeFile } from 'node:fs/promises';
import type { AudioManifest, AudioScript, NarrationLine } from './audio.ts';
import type { ClipMark, CursorSample } from './recorder.ts';
import type { FilmManifest } from './manifest.ts';

/**
 * Writes the HyperFrames composition for a recording: one scene per clip, the camera moving
 * between the places the reader acted, the pointer drawn from its log, captions and narration
 * on the recording's marks, a music bed ducked under the voice, clicks on the clicks, and the
 * end card. The clips are one continuous session, so the seams between scenes are invisible:
 * each scene starts with the camera where the last one left it. The footage is the clock: a
 * narration line has to fit the window its cue gives it, and the generator fails if it does
 * not, naming the line.
 */

const GROUND = '#1a1917';
const INK = '#f7f7f2';
const MUTED = '#b8b5ad';
const ACCENT = '#2ec4b0';
/** How long a camera move takes, measured against the official launch films: 0.4–0.6 s. */
const MOVE = 0.55;
/** A caption holds 0.5 s plus 0.3 s a word, the reading rate the motion guidance measures. */
const captionHold = (text: string): number => 0.5 + 0.3 * text.split(' ').length;
/** The music sits here under nobody, and ducks to this under the narrator. */
const BED = 0.7;
const BED_UNDER_VOICE = 0.28;
const DUCK_LEAD = 0.3;

interface CameraState {
	readonly cx: number;
	readonly cy: number;
	readonly s: number;
}

interface CameraKey extends CameraState {
	readonly t: number;
}

type Clip = FilmManifest['clips'][number];

const markTime = (clip: Clip, name: string): number => {
	const mark = clip.marks.find((candidate) => candidate.name === name);
	if (!mark) throw new Error(`The "${clip.beat}" clip has no "${name}" mark.`);
	return mark.t;
};

/** The pointer's position at the n-th press of the clip. */
const press = (clip: Clip, index: number): CursorSample => {
	const downs = clip.cursor.filter((sample) => sample.kind === 'down');
	const sample = downs[index];
	if (!sample) throw new Error(`The "${clip.beat}" clip has no press ${index + 1}.`);
	return sample;
};

const frame = (viewport: FilmManifest['viewport']): CameraState => ({
	cx: viewport.width / 2,
	cy: viewport.height / 2,
	s: 1
});

// ── Camera ──────────────────────────────────────────────────────────────────────────────

/**
 * Where the camera is through each beat. Pushes land on the control the reader uses, as the
 * launch-film guidance asks: the composer while typing, the panel while the agent works, the
 * note while it changes. Every scene begins where the previous one ended.
 */
const cameraKeys = (manifest: FilmManifest): readonly (readonly CameraKey[])[] => {
	const { viewport } = manifest;
	const full = frame(viewport);
	const panelX = viewport.width - 192;
	const noteX = 1000;
	let last: CameraState = full;
	const plans: Readonly<Record<string, (clip: Clip) => readonly CameraKey[]>> = {
		context: (clip) => [
			{ t: 0, ...full },
			{ t: markTime(clip, 'note-open') + 0.2, cx: noteX, cy: 460, s: 1.25 },
			{ t: markTime(clip, 'chat-open') + 0.1, cx: 1180, cy: 540, s: 1.18 }
		],
		'agent-acts': (clip) => {
			const composer = press(clip, 0);
			return [
				{ t: composer.t - 0.3, cx: composer.x - 260, cy: composer.y - 60, s: 1.6 },
				{ t: markTime(clip, 'sent') + 0.4, cx: panelX, cy: 440, s: 1.5 },
				{ t: markTime(clip, 'answered') + 0.2, cx: panelX, cy: 620, s: 1.5 },
				{ t: markTime(clip, 'release-plan-open') + 0.1, cx: noteX, cy: 540, s: 1.15 }
			];
		},
		'extract-promise': (clip) => {
			const start = press(clip, 0);
			return [
				{ t: start.t - 0.4, cx: start.x + 160, cy: start.y, s: 1.7 },
				{ t: markTime(clip, 'proposed') + 0.1, cx: start.x + 160, cy: start.y + 110, s: 1.6 },
				{ t: markTime(clip, 'accepted') + 0.6, cx: noteX, cy: 540, s: 1.15 }
			];
		},
		'widget-proposal': (clip) => {
			// The first press starts the new chat; the second lands in the composer.
			const composer = press(clip, 1);
			return [
				{ t: composer.t - 0.3, cx: composer.x - 260, cy: composer.y - 60, s: 1.6 },
				{ t: markTime(clip, 'sent') + 0.4, cx: panelX, cy: 480, s: 1.5 },
				{ t: markTime(clip, 'proposed') + 0.2, cx: panelX, cy: 640, s: 1.45 }
			];
		},
		'widget-result': (clip) => {
			const drag = press(clip, 1);
			return [
				{ t: markTime(clip, 'approved') + 0.3, cx: panelX, cy: 520, s: 1.35 },
				{ t: markTime(clip, 'embedded') + 0.2, cx: noteX, cy: 540, s: 1.25 },
				{ t: drag.t - 0.5, cx: drag.x + 120, cy: drag.y, s: 1.8 },
				{ t: markTime(clip, 'legal-12') + 1.2, cx: noteX, cy: 540, s: 1.3 }
			];
		}
	};
	return manifest.clips.map((clip) => {
		const plan = plans[clip.beat];
		if (!plan) throw new Error(`No camera plan for the "${clip.beat}" beat.`);
		const keys: CameraKey[] = [{ t: 0, ...last }];
		for (const key of plan(clip)) if (key.t > 0) keys.push(key);
		last = keys[keys.length - 1] ?? last;
		return keys;
	});
};

/** The translate that puts `cx, cy` at the frame centre at scale `s`, without showing the edge. */
const translate = (
	state: CameraState,
	viewport: FilmManifest['viewport']
): { readonly x: number; readonly y: number } => ({
	x: Math.min(
		0,
		Math.max(viewport.width - viewport.width * state.s, viewport.width / 2 - state.cx * state.s)
	),
	y: Math.min(
		0,
		Math.max(viewport.height - viewport.height * state.s, viewport.height / 2 - state.cy * state.s)
	)
});

// ── Cues ────────────────────────────────────────────────────────────────────────────────

/** A moment in the film with a caption, and a narration line when the narrator speaks there. */
export interface Cue {
	readonly id: string;
	/** Seconds into the film. */
	readonly at: number;
	readonly caption: string;
	readonly narration?: string;
	/** Where the caption has to be gone: the next cue of the clip, or the clip's end. */
	readonly until: number;
}

interface CuePlan {
	readonly id: string;
	readonly at: (clip: Clip) => number;
	readonly caption: string;
	readonly narration?: string;
}

/**
 * What the film says, beat by beat, on the recording's own marks. Captions are short and about
 * the moment; the narrator says the one thing the picture cannot.
 */
const cuePlans: Readonly<Record<string, readonly CuePlan[]>> = {
	context: [
		{
			id: 'project',
			at: () => 0.4,
			caption: 'Your notes. Your brief. Your decisions.',
			narration:
				"Here's a project in FollowThrough. A planning note, the launch brief, two decisions, and the first todos."
		},
		{
			id: 'context',
			at: (clip) => markTime(clip, 'chat-open') + 0.2,
			caption: 'The agent works from all of it.'
		}
	],
	'agent-acts': [
		{
			// Spoken while the request is typed, so the explanation has the room it needs.
			id: 'request',
			at: (clip) => press(clip, 0).t + 1.5,
			caption: '',
			narration:
				'Instead of talking it through, I just ask for the work. It reads the brief and the notes, writes the release plan, adds the tasks to the board, and exports a Word brief for the team.'
		},
		{
			id: 'ask',
			at: (clip) => markTime(clip, 'sent') + 0.2,
			caption: 'Ask it to do the work.'
		},
		{
			id: 'done',
			at: (clip) => markTime(clip, 'answered') + 0.1,
			caption: 'Everything it did is listed.',
			narration: "When it's done, everything it did is listed, with a link to each thing it made."
		}
	],
	'extract-promise': [
		{
			id: 'yours',
			at: () => 0.3,
			caption: "It's still your note.",
			narration:
				"It's still my note, so I keep editing it. I highlight a sentence that sounds like a promise, and ask it to extract it."
		},
		{
			id: 'promise',
			at: (clip) => markTime(clip, 'proposed') + 0.1,
			caption: 'A todo, where the promise was made.',
			narration: 'It shows up right there, due date worked out. I accept it.'
		}
	],
	'widget-proposal': [
		{
			id: 'build',
			at: (clip) => Math.max(0.3, press(clip, 0).t - 0.3),
			caption: 'Build on what changed.',
			narration:
				'Now I can ask for something that builds on the plan I just changed. A small simulator for the critical path.'
		},
		{
			id: 'noticed',
			at: (clip) => markTime(clip, 'proposed') + 0.1,
			caption: 'It noticed QA is five days now.'
		}
	],
	'widget-result': [
		{
			id: 'approve',
			at: (clip) => markTime(clip, 'approved') + 0.1,
			caption: "Approve it, and it's part of the note.",
			narration: 'I approve it, and it goes straight into the note.'
		},
		{
			id: 'drag',
			// Spoken as the drag happens, so the line and the slider move together.
			at: (clip) => press(clip, 1).t - 0.2,
			caption: 'The work stays with the project.',
			narration:
				'Drag legal review out to twelve days, and the content stream becomes the critical path.'
		}
	]
};

const END_LINE = "FollowThrough. The agent doesn't just know your project. It can work on it.";
const END_CARD_MIN = 3.6;

/** Where each clip starts, and where the end card starts. */
const starts = (manifest: FilmManifest): readonly number[] => {
	const out: number[] = [];
	let at = 0;
	for (const clip of manifest.clips) {
		out.push(at);
		at += clip.duration;
	}
	out.push(at);
	return out;
};

/** Every cue of the film in order, timed into the film, plus the end card's line. */
export const filmCues = (manifest: FilmManifest): readonly Cue[] => {
	const clipStarts = starts(manifest);
	const cues: Cue[] = [];
	manifest.clips.forEach((clip, index) => {
		const plans = cuePlans[clip.beat];
		if (!plans) throw new Error(`No cues for the "${clip.beat}" beat.`);
		const start = clipStarts[index] ?? 0;
		const local = plans.map((plan) => ({ plan, at: plan.at(clip) }));
		local.forEach(({ plan, at }, position) => {
			const next = local[position + 1]?.at ?? clip.duration;
			cues.push({
				id: plan.id,
				at: start + at,
				caption: plan.caption,
				...(plan.narration ? { narration: plan.narration } : {}),
				until: start + next
			});
		});
	});
	const endStart = clipStarts[manifest.clips.length] ?? 0;
	cues.push({
		id: 'end',
		at: endStart + 0.3,
		caption: '',
		narration: END_LINE,
		until: endStart + END_CARD_MIN
	});
	return cues;
};

/** What the audio generator makes for the cues. */
export const audioScript = (cues: readonly Cue[]): AudioScript => ({
	narration: cues.flatMap((cue): NarrationLine[] =>
		cue.narration ? [{ id: cue.id, text: cue.narration }] : []
	),
	music: {
		prompt:
			'Slow, warm, understated underscore for a product film: soft felt piano and sustained pads around 70 bpm, no drums, no bright synths, nothing busy. Unhurried and quietly confident, staying under a speaking voice, settling gently at the end.',
		lengthMs: 82_000
	},
	click: 'A soft, short, dry mouse click on a quiet desk, close to the microphone.',
	typing: 'Light laptop keyboard typing in a quiet room, steady, no music.'
});

/** The end card's line starts no earlier than 0.5 s after the footage's last line ends. */
const withEndLineAfterFootage = (cues: readonly Cue[], audio: AudioManifest): readonly Cue[] => {
	const spoken = cues.filter((cue) => cue.narration && cue.id !== 'end');
	const last = spoken[spoken.length - 1];
	const lastClip = last ? audio.narration[last.id] : undefined;
	const earliest = last && lastClip ? last.at + lastClip.duration + 0.5 : 0;
	return cues.map((cue) =>
		cue.id === 'end' && cue.at < earliest
			? { ...cue, at: earliest, until: earliest + END_CARD_MIN }
			: cue
	);
};

/**
 * The window each narration line has: until the next narration starts. A line that does not
 * fit is a script problem to fix in the cue table, not something to speak over.
 */
const narrationFits = (cues: readonly Cue[], audio: AudioManifest, total: number): void => {
	const spoken = cues.filter((cue) => cue.narration);
	spoken.forEach((cue, index) => {
		const clip = audio.narration[cue.id];
		if (!clip) throw new Error(`The "${cue.id}" line was not generated.`);
		const window = (spoken[index + 1]?.at ?? total) - cue.at - 0.2;
		if (clip.duration > window)
			throw new Error(
				`The "${cue.id}" narration runs ${clip.duration.toFixed(1)}s but has ${window.toFixed(1)}s before the next line. Shorten it.`
			);
	});
};

// ── Scenes ──────────────────────────────────────────────────────────────────────────────

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="28" height="40">
  <path d="M3 2 L3 31 L10.5 24 L15.5 36 L21 33.5 L16 22 L26 22 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
</svg>
`;

const sceneHtml = (
	manifest: FilmManifest,
	clip: Clip,
	index: number,
	keys: readonly CameraKey[],
	last: boolean
): string => {
	const { viewport } = manifest;
	const id = `beat${index + 1}`;
	const duration = clip.duration.toFixed(3);
	const camera = keys.map((key) => ({ t: key.t, s: key.s, ...translate(key, viewport) }));
	// The pointer log is dense (a sample a frame while moving); it is tweened sample to sample.
	const cursor = clip.cursor.map((sample: CursorSample) => [
		Number(sample.t.toFixed(3)),
		Math.round(sample.x),
		Math.round(sample.y),
		sample.kind === 'move' ? 0 : sample.kind === 'down' ? 1 : 2
	]);
	const marks = clip.marks.map((mark: ClipMark) => `${mark.name}@${mark.t.toFixed(2)}`).join(', ');
	return `<template>
  <!-- ${clip.beat}: ${clip.caption}. Marks: ${marks} -->
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; background: ${GROUND}; }
    #${id}-stage { position: absolute; inset: 0; }
    #${id}-cam { position: absolute; left: 0; top: 0; width: ${viewport.width}px; height: ${viewport.height}px; transform-origin: 0 0; will-change: transform; }
    #${id}-video { position: absolute; left: 0; top: 0; width: ${viewport.width}px; height: ${viewport.height}px; object-fit: fill; }
    #${id}-cursor { position: absolute; left: 0; top: 0; width: 32px; height: 46px; transform-origin: 3.4px 2.3px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.45)); }
    #${id}-dip { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${viewport.width}" data-height="${viewport.height}">
    <div id="${id}-stage" data-layout-allow-overflow>
      <div id="${id}-cam">
        <video id="${id}-video" class="clip" src="assets/clips/${clip.file}" muted playsinline data-start="0" data-duration="${duration}" data-track-index="0"></video>
        <img id="${id}-cursor" src="assets/cursor.svg" alt="" />
      </div>
      <div id="${id}-dip"></div>
    </div>
  </div>
  <script>
    (() => {
      const tl = gsap.timeline({ paused: true });
      const camera = ${JSON.stringify(camera)};
      const first = camera[0];
      tl.set("#${id}-cam", { scale: first.s, x: first.x, y: first.y }, 0);
      for (const key of camera.slice(1))
        tl.to("#${id}-cam", { scale: key.s, x: key.x, y: key.y, duration: ${MOVE}, ease: "power2.inOut" }, key.t);
      const cursor = ${JSON.stringify(cursor)};
      const [t0, x0, y0] = cursor[0];
      tl.set("#${id}-cursor", { x: x0, y: y0, scale: 1 }, 0);
      let prev = t0;
      for (const [t, x, y, kind] of cursor.slice(1)) {
        const duration = Math.max(t - prev, 1 / ${manifest.fps});
        tl.to("#${id}-cursor", { x, y, duration, ease: "none" }, prev);
        if (kind === 1) tl.to("#${id}-cursor", { scale: 0.86, duration: 0.07, ease: "power2.out" }, t);
        if (kind === 2) tl.to("#${id}-cursor", { scale: 1, duration: 0.12, ease: "power2.out" }, t);
        prev = t;
      }
      ${last ? `tl.to("#${id}-dip", { opacity: 0.45, duration: 0.1, ease: "none" }, ${(clip.duration - 0.1).toFixed(3)});` : ''}
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
};

// ── Captions ────────────────────────────────────────────────────────────────────────────

const captionsHtml = (manifest: FilmManifest, cues: readonly Cue[]): string => {
	const { viewport } = manifest;
	const shown = cues
		.filter((cue) => cue.caption)
		.map((cue) => ({
			id: cue.id,
			start: cue.at,
			hold: Math.min(captionHold(cue.caption), cue.until - cue.at - 0.2),
			words: cue.caption.split(' ')
		}));
	const items = shown
		.map(
			(
				cue
			) => `    <div id="cap-${cue.id}" class="clip caption" data-start="${cue.start.toFixed(3)}" data-duration="${cue.hold.toFixed(2)}" data-track-index="0">
      <div class="rule"></div>
      <div class="line">${cue.words.map((word) => `<span class="w">${word}</span>`).join(' ')}</div>
    </div>`
		)
		.join('\n');
	return `<template>
  <style>
    #root { position: absolute; inset: 0; pointer-events: none; }
    .caption { position: absolute; left: ${Math.round(viewport.width * 0.1)}px; bottom: ${Math.round(viewport.height * 0.1)}px; font-family: Inter, sans-serif; color: ${INK}; }
    .rule { display: block; width: 56px; height: 3px; margin-bottom: 16px; background: ${ACCENT}; transform-origin: 0 50%; }
    .line { font-size: 54px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; text-shadow: 0 2px 18px rgba(0,0,0,.6); }
    .w { display: inline-block; }
  </style>
  <div id="root" data-composition-id="captions" data-width="${viewport.width}" data-height="${viewport.height}">
${items}
  </div>
  <script>
    (() => {
      const tl = gsap.timeline({ paused: true });
      const captions = ${JSON.stringify(shown.map((cue) => ({ id: cue.id, start: cue.start, hold: cue.hold })))};
      for (const cap of captions) {
        const words = "#cap-" + cap.id + " .w";
        tl.fromTo("#cap-" + cap.id + " .rule", { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "expo.out" }, cap.start + 0.05);
        tl.fromTo(words, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.13, ease: "power2.out", stagger: 0.067 }, cap.start + 0.1);
        const out = cap.start + cap.hold - 0.3;
        tl.to(words, { opacity: 0, filter: "blur(6px)", duration: 0.18, ease: "power2.in", stagger: 0.03 }, out);
        tl.to("#cap-" + cap.id + " .rule", { opacity: 0, duration: 0.18, ease: "power2.in" }, out);
      }
      window.__timelines["captions"] = tl;
    })();
  </script>
</template>
`;
};

// ── End card ────────────────────────────────────────────────────────────────────────────

const endHtml = (manifest: FilmManifest, duration: number): string => {
	const { viewport } = manifest;
	return `<template>
  <style>
    #root { position: absolute; inset: 0; background: ${GROUND}; overflow: hidden; }
    #end-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px; font-family: Inter, sans-serif; }
    #end-lockup { display: flex; align-items: center; gap: 28px; }
    #end-mark { width: 132px; height: 132px; }
    #end-word { font-size: 84px; font-weight: 600; letter-spacing: -0.03em; color: ${INK}; }
    #end-word .w { display: inline-block; }
    #end-cta { font-size: 30px; font-weight: 500; letter-spacing: 0.01em; color: ${MUTED}; }
    #end-cta b { color: ${ACCENT}; font-weight: 500; }
  </style>
  <div id="root" data-composition-id="end" data-width="${viewport.width}" data-height="${viewport.height}">
    <div id="end-card" class="clip" data-start="0" data-duration="${duration.toFixed(2)}" data-track-index="0">
      <div id="end-lockup">
        <img id="end-mark" src="assets/mark.svg" alt="FollowThrough" />
        <div id="end-word"><span class="w">Follow</span><span class="w">Through</span></div>
      </div>
      <div id="end-cta">The agent doesn't just know your project. It can work on it. · <b>github.com/chidirnweke/FollowThrough.ai</b></div>
    </div>
  </div>
  <script>
    (() => {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#end-mark", { scale: 0.6, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }, 0.1);
      tl.fromTo("#end-word .w", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.13, ease: "power2.out", stagger: 0.09 }, 0.35);
      tl.fromTo("#end-cta", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 0.8);
      window.__timelines["end"] = tl;
    })();
  </script>
</template>
`;
};

// ── Sound ───────────────────────────────────────────────────────────────────────────────

const attr = (value: string): string => value.replaceAll('"', '&quot;');

/**
 * The `<audio>` elements of the root: the narrator's lines at their cues, the bed with a
 * volume lane that ducks under each line, a click on every press, and the keyboard under
 * every typing span.
 */
const audioHtml = (
	manifest: FilmManifest,
	cues: readonly Cue[],
	audio: AudioManifest,
	total: number
): string => {
	const clipStarts = starts(manifest);
	const lines: string[] = [];
	const spoken = cues.filter((cue) => cue.narration);
	for (const cue of spoken) {
		const clip = audio.narration[cue.id];
		if (!clip) throw new Error(`The "${cue.id}" line was not generated.`);
		lines.push(
			`      <audio id="voice-${cue.id}" class="clip" src="assets/audio/${clip.file}" data-start="${cue.at.toFixed(3)}" data-duration="${clip.duration.toFixed(3)}" data-volume="1" data-audio-group="voiceover" data-track-index="3"></audio>`
		);
	}
	// The bed ducks from just before a line to just after it; a lane holds its last value to
	// the end, so the level is restated after every line.
	const points: { t: number; v: number }[] = [{ t: 0, v: BED }];
	for (const cue of spoken) {
		const clip = audio.narration[cue.id];
		if (!clip) continue;
		points.push({ t: Math.max(0, cue.at - DUCK_LEAD - 0.2), v: BED });
		points.push({ t: Math.max(0, cue.at - DUCK_LEAD), v: BED_UNDER_VOICE });
		points.push({ t: cue.at + clip.duration + DUCK_LEAD, v: BED_UNDER_VOICE });
		points.push({ t: cue.at + clip.duration + DUCK_LEAD + 0.4, v: BED });
	}
	const lane = { version: 1, lanes: [{ target: 'volume', points }] };
	lines.push(
		`      <audio id="music" class="clip" src="assets/audio/${audio.music.file}" data-start="0" data-duration="${Math.min(total, audio.music.duration).toFixed(3)}" data-fade-in="0.6" data-fade-out="1.5" data-audio-group="music" data-track-index="4" data-automation="${attr(JSON.stringify(lane))}"></audio>`
	);
	let clicks = 0;
	let spans = 0;
	manifest.clips.forEach((clip, index) => {
		const start = clipStarts[index] ?? 0;
		for (const sample of clip.cursor) {
			if (sample.kind !== 'down') continue;
			clicks += 1;
			// Light arrives before sound: the click peaks one frame after the press.
			lines.push(
				`      <audio id="click-${clicks}" class="clip" src="assets/audio/${audio.click.file}" data-start="${(start + sample.t + 1 / manifest.fps).toFixed(3)}" data-duration="${audio.click.duration.toFixed(3)}" data-volume="0.5" data-audio-group="sfx" data-track-index="5"></audio>`
			);
		}
		let open: number | undefined;
		for (const mark of clip.marks) {
			if (mark.name === 'typing-start') open = mark.t;
			if (mark.name === 'typing-end' && open !== undefined) {
				spans += 1;
				const length = Math.min(mark.t - open, audio.typing.duration);
				lines.push(
					`      <audio id="keys-${spans}" class="clip" src="assets/audio/${audio.typing.file}" data-start="${(start + open).toFixed(3)}" data-duration="${length.toFixed(3)}" data-volume="0.25" data-fade-in="0.2" data-fade-out="0.3" data-audio-group="sfx" data-track-index="5"></audio>`
				);
				open = undefined;
			}
		}
	});
	return [
		'      <hf-audio-group id="voiceover"></hf-audio-group>',
		'      <hf-audio-group id="music"></hf-audio-group>',
		'      <hf-audio-group id="sfx"></hf-audio-group>',
		...lines
	].join('\n');
};

// ── Root ────────────────────────────────────────────────────────────────────────────────

const indexHtml = (
	manifest: FilmManifest,
	clipStarts: readonly number[],
	endCard: number,
	total: number,
	sound: string
): string => {
	const { viewport } = manifest;
	const hosts = manifest.clips
		.map((clip, index) => {
			const id = `beat${index + 1}`;
			return `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${(clipStarts[index] ?? 0).toFixed(3)}" data-duration="${clip.duration.toFixed(3)}" data-track-index="1" data-track-kind="graphics" data-width="${viewport.width}" data-height="${viewport.height}"></div>`;
		})
		.join('\n');
	const endStart = clipStarts[manifest.clips.length] ?? 0;
	return `<!doctype html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden; background: ${GROUND}; }
      #root { width: 100%; height: 100%; position: relative; }
      #ground { position: absolute; inset: 0; background: ${GROUND}; }
    </style>
  </head>
  <body>
    <!-- Generated by pnpm docs:video from artifacts/video/manifest.json (recorded ${manifest.recordedAt}). -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total.toFixed(3)}" data-width="${viewport.width}" data-height="${viewport.height}">
      <div id="ground"></div>
${hosts}
      <div id="end" data-composition-id="end" data-composition-src="compositions/end.html" data-start="${endStart.toFixed(3)}" data-duration="${endCard.toFixed(2)}" data-track-index="1" data-track-kind="graphics" data-width="${viewport.width}" data-height="${viewport.height}"></div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${endStart.toFixed(3)}" data-track-index="2" data-track-kind="captions" data-width="${viewport.width}" data-height="${viewport.height}"></div>
${sound}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
};

/** Write the composition for a manifest into the film project, with its sound when given. */
export const writeFilm = async (
	manifest: FilmManifest,
	film: URL,
	mark: URL,
	cues: readonly Cue[],
	audio: AudioManifest | undefined
): Promise<void> => {
	const clipStarts = starts(manifest);
	const endStart = clipStarts[manifest.clips.length] ?? 0;
	// The end card's line waits for the last line of the footage to finish, and the card holds
	// for as long as the line needs: the footage is the clock, the card is the slack.
	const timed = audio ? withEndLineAfterFootage(cues, audio) : cues;
	const endCue = timed.find((cue) => cue.id === 'end');
	const endLine = audio?.narration['end'];
	const endCard = Math.max(
		END_CARD_MIN,
		endLine && endCue ? endCue.at - endStart + endLine.duration + 0.8 : 0
	);
	const total = endStart + endCard;
	if (audio) narrationFits(timed, audio, total);
	const compositions = new URL('compositions/', film);
	await mkdir(compositions, { recursive: true });
	await mkdir(new URL('assets/', film), { recursive: true });
	await writeFile(new URL('assets/cursor.svg', film), CURSOR_SVG);
	await cp(mark, new URL('assets/mark.svg', film));
	const keys = cameraKeys(manifest);
	await Promise.all(
		manifest.clips.map((clip, index) =>
			writeFile(
				new URL(`beat${index + 1}.html`, compositions),
				sceneHtml(manifest, clip, index, keys[index] ?? [], index === manifest.clips.length - 1)
			)
		)
	);
	await writeFile(new URL('captions.html', compositions), captionsHtml(manifest, timed));
	await writeFile(new URL('end.html', compositions), endHtml(manifest, endCard));
	await writeFile(
		new URL('index.html', film),
		indexHtml(
			manifest,
			clipStarts,
			endCard,
			total,
			audio ? audioHtml(manifest, timed, audio, total) : ''
		)
	);
};
