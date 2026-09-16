import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import type { Mermaid } from 'mermaid';
import type { MermaidRenderConfig } from '$lib/models/diagrams/mermaid-theme';
import type { ExportDiagramSource, ExportDiagramRaster } from '$lib/models/deliverables';

declare global {
	interface Window {
		mermaid: Mermaid;
	}
}

const require = createRequire(import.meta.url);
const mermaidScript = require.resolve('mermaid/dist/mermaid.js');

/** Render local diagram sources in a disposable browser with no account session or network. */
export class DiagramRasterizer {
	private fontData?: string;
	async render(
		sources: readonly ExportDiagramSource[],
		config: MermaidRenderConfig
	): Promise<ReadonlyMap<string, ExportDiagramRaster>> {
		const result = new Map<string, ExportDiagramRaster>();
		if (!sources.length) return result;
		const browser = await chromium.launch({
			headless: true,
			env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' }
		});
		const timeout = AbortSignal.timeout(30_000);
		try {
			const page = await browser.newPage({ deviceScaleFactor: 2, serviceWorkers: 'block' });
			await page.route('**/*', (route) => route.abort('blockedbyclient'));
			await page.setContent(
				'<!doctype html><html><body style="margin:0;background:white"><div id="drawing"></div></body></html>'
			);
			this.fontData ??= (
				await readFile(
					require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
				)
			).toString('base64');
			await page.addStyleTag({
				content: `@font-face {font-family: 'Inter Variable'; font-style: normal; font-weight: 100 900; src: url(data:font/woff2;base64,${this.fontData}) format('woff2');}`
			});
			await page.evaluate(() => document.fonts.load('14px "Inter Variable"'));
			if (sources.some((source) => source.kind === 'mermaid')) {
				await page.addScriptTag({ path: mermaidScript });
				await page.evaluate((configuration) => window.mermaid.initialize(configuration), config);
			}
			const render = async () => {
				for (const [index, source] of sources.entries()) {
					const size = await page.evaluate(
						async ({ source, index }) => {
							const host = document.getElementById('drawing');
							if (!host) throw new Error('Diagram render host is missing');
							host.replaceChildren();
							if (source.kind === 'mermaid') {
								const { svg } = await window.mermaid.render(
									`export-diagram-${index}`,
									source.source
								);
								host.innerHTML = svg;
							} else {
								// SVG-as-image disables active SVG content, including scripts and event handlers.
								const image = document.createElement('img');
								const imageUrl = URL.createObjectURL(
									new Blob([source.source], { type: 'image/svg+xml' })
								);
								try {
									image.src = imageUrl;
									await image.decode();
								} finally {
									URL.revokeObjectURL(imageUrl);
								}
								host.appendChild(image);
								if (!image.naturalWidth || !image.naturalHeight)
									throw new Error('Diagram image has no usable size');
								const root = new DOMParser().parseFromString(
									source.source,
									'image/svg+xml'
								).documentElement;
								if (!(root instanceof SVGSVGElement))
									throw new Error('Diagram preview is not an SVG');
								const viewBox = root.viewBox.baseVal;
								const size =
									viewBox.width > 0 && viewBox.height > 0
										? { width: viewBox.width, height: viewBox.height }
										: { width: image.naturalWidth, height: image.naturalHeight };
								image.style.width = `${size.width}px`;
								image.style.height = `${size.height}px`;
								return size;
							}
							const svg = host.querySelector('svg');
							if (!svg) throw new Error('Diagram rendering produced no SVG');
							const viewBox = svg.viewBox.baseVal;
							const width = viewBox.width || svg.getBoundingClientRect().width;
							const height = viewBox.height || svg.getBoundingClientRect().height;
							if (!(width > 0 && height > 0)) throw new Error('Diagram image has no usable size');
							svg.style.width = `${width}px`;
							svg.style.height = `${height}px`;
							svg.style.maxWidth = 'none';
							return { width, height };
						},
						{ source, index }
					);
					await page.setViewportSize({
						width: Math.ceil(size.width),
						height: Math.ceil(size.height)
					});
					const png = await page
						.locator('#drawing > :first-child')
						.screenshot({ type: 'png', animations: 'disabled' });
					result.set(source.key, { png: `data:image/png;base64,${png.toString('base64')}`, size });
				}
				return result;
			};
			timeout.throwIfAborted();
			return await Promise.race([
				render(),
				new Promise<never>((_resolve, reject) =>
					timeout.addEventListener(
						'abort',
						() => reject(new Error('Diagram rendering timed out')),
						{ once: true }
					)
				)
			]);
		} catch (error) {
			throw new Error('A diagram could not be rendered for export', { cause: error });
		} finally {
			await browser.close();
		}
	}
}
