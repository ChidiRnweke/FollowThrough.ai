import { cp, mkdir, writeFile } from 'node:fs/promises';
import type { ClipMark, CursorSample } from './recorder.ts';
import type { FilmManifest } from './manifest.ts';

/**
 * Writes the HyperFrames composition for a recording: one scene per clip, the camera moving
 * between the places the reader acted, the pointer drawn from its log, one caption per beat,
 * and the end card. The clips are one continuous session, so the seams between scenes are
 * invisible: each scene starts with the camera where the last one left it.
 */

const GROUND = '#1a1917';
const INK = '#f7f7f2';
const MUTED = '#b8b5ad';
const ACCENT = '#2ec4b0';
const CAPTION_HOLD = 3.4;
const END_CARD = 3.6;
/** How long a camera move takes, measured against the official launch films: 0.4–0.6 s. */
const MOVE = 0.55;

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

const captionsHtml = (manifest: FilmManifest, starts: readonly number[]): string => {
	const { viewport } = manifest;
	const items = manifest.clips
		.map((clip, index) => {
			const words = clip.caption.split(' ');
			const hold = Math.min(CAPTION_HOLD, clip.duration - 0.6);
			return `    <div id="cap${index + 1}" class="clip caption" data-start="${(starts[index] ?? 0) + 0.3}" data-duration="${hold.toFixed(2)}" data-track-index="0">
      <div class="eyebrow"><span class="num">0${index + 1}</span><span class="rule"></span></div>
      <div class="line">${words.map((word) => `<span class="w">${word}</span>`).join(' ')}</div>
    </div>`;
		})
		.join('\n');
	return `<template>
  <style>
    #root { position: absolute; inset: 0; pointer-events: none; }
    .caption { position: absolute; left: ${Math.round(viewport.width * 0.1)}px; bottom: ${Math.round(viewport.height * 0.1)}px; font-family: Inter, sans-serif; color: ${INK}; }
    .eyebrow { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .num { font-size: 22px; font-weight: 600; letter-spacing: 0.12em; color: ${ACCENT}; }
    .rule { display: block; width: 56px; height: 2px; background: ${ACCENT}; transform-origin: 0 50%; }
    .line { font-size: 54px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; text-shadow: 0 2px 18px rgba(0,0,0,.6); }
    .w { display: inline-block; }
  </style>
  <div id="root" data-composition-id="captions" data-width="${viewport.width}" data-height="${viewport.height}">
${items}
  </div>
  <script>
    (() => {
      const tl = gsap.timeline({ paused: true });
      const captions = ${JSON.stringify(manifest.clips.map((clip, index) => ({ id: `cap${index + 1}`, start: (starts[index] ?? 0) + 0.3, hold: Math.min(CAPTION_HOLD, clip.duration - 0.6) })))};
      for (const cap of captions) {
        const words = "#" + cap.id + " .w";
        tl.fromTo("#" + cap.id + " .num", { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, cap.start);
        tl.fromTo("#" + cap.id + " .rule", { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "expo.out" }, cap.start + 0.05);
        tl.fromTo(words, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.13, ease: "power2.out", stagger: 0.067 }, cap.start + 0.1);
        const out = cap.start + cap.hold - 0.3;
        tl.to(words, { opacity: 0, filter: "blur(6px)", duration: 0.18, ease: "power2.in", stagger: 0.03 }, out);
        tl.to("#" + cap.id + " .eyebrow", { opacity: 0, duration: 0.18, ease: "power2.in" }, out);
      }
      window.__timelines["captions"] = tl;
    })();
  </script>
</template>
`;
};

const endHtml = (manifest: FilmManifest): string => {
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
    <div id="end-card" class="clip" data-start="0" data-duration="${END_CARD}" data-track-index="0">
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

const indexHtml = (manifest: FilmManifest, starts: readonly number[], total: number): string => {
	const { viewport } = manifest;
	const hosts = manifest.clips
		.map((clip, index) => {
			const id = `beat${index + 1}`;
			return `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${(starts[index] ?? 0).toFixed(3)}" data-duration="${clip.duration.toFixed(3)}" data-track-index="1" data-track-kind="graphics" data-width="${viewport.width}" data-height="${viewport.height}"></div>`;
		})
		.join('\n');
	const endStart = starts[manifest.clips.length] ?? 0;
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
      <div id="end" data-composition-id="end" data-composition-src="compositions/end.html" data-start="${endStart.toFixed(3)}" data-duration="${END_CARD}" data-track-index="1" data-track-kind="graphics" data-width="${viewport.width}" data-height="${viewport.height}"></div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${endStart.toFixed(3)}" data-track-index="2" data-track-kind="captions" data-width="${viewport.width}" data-height="${viewport.height}"></div>
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
};

/** Write the composition for a manifest into the film project. */
export const writeFilm = async (manifest: FilmManifest, film: URL, mark: URL): Promise<void> => {
	const starts: number[] = [];
	let at = 0;
	for (const clip of manifest.clips) {
		starts.push(at);
		at += clip.duration;
	}
	starts.push(at);
	const total = at + END_CARD;
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
	await writeFile(new URL('captions.html', compositions), captionsHtml(manifest, starts));
	await writeFile(new URL('end.html', compositions), endHtml(manifest));
	await writeFile(new URL('index.html', film), indexHtml(manifest, starts, total));
};
