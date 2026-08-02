import type { Mermaid } from 'mermaid';
import mermaidScriptUrl from 'mermaid/dist/mermaid.min.js?url';

const SCRIPT_ID = 'followthrough-mermaid-runtime';

const runtime = (): Mermaid | undefined =>
	(globalThis as typeof globalThis & { mermaid?: Mermaid }).mermaid;

/** Loads Mermaid's complete browser distribution as an asset, outside the application chunk graph. */
export const loadMermaid = async (): Promise<Mermaid> => {
	const loaded = runtime();
	if (loaded) return loaded;

	const existing = document.getElementById(SCRIPT_ID);
	let script: HTMLScriptElement;
	if (existing instanceof HTMLScriptElement) {
		script = existing;
	} else {
		script = document.createElement('script');
		script.id = SCRIPT_ID;
		script.src = mermaidScriptUrl;
		script.async = true;
		document.head.appendChild(script);
	}

	await new Promise<void>((resolve, reject) => {
		if (runtime()) {
			resolve();
			return;
		}
		script.addEventListener('load', () => resolve(), { once: true });
		script.addEventListener('error', () => reject(new Error('Mermaid could not be loaded.')), {
			once: true
		});
	});

	const mermaid = runtime();
	if (!mermaid) throw new Error('Mermaid loaded without exposing its browser API.');
	return mermaid;
};
