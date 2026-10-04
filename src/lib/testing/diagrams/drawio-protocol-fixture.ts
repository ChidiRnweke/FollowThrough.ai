import { defineBrowserCommand } from '@vitest/browser-playwright';
import type { BrowserCommandContext } from 'vitest/node';
const fixtureUrl = 'https://embed.diagrams.net/**';
const handlers = new WeakMap<
	BrowserCommandContext['page'],
	(route: import('playwright').Route) => Promise<void>
>();

const html = `<!doctype html><meta charset="utf-8"><script>
let loadedXml = '';
const svgFor = (xml) => {
  const id = /<diagram id="([^"]+)">/.exec(xml)?.[1] ?? 'unknown';
  return '<svg xmlns="http://www.w3.org/2000/svg"><text>' + id + '</text></svg>';
};
window.addEventListener('message', (event) => {
  if (event.source !== parent) return;
  let message;
  try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
  catch { return; }
  if (message.action === 'load') {
    loadedXml = message.xml;
    parent.postMessage(JSON.stringify({ event: 'load' }), '*');
  }
  if (message.action === 'export') {
    const svg = svgFor(loadedXml);
    parent.postMessage(JSON.stringify({
      event: 'export', xml: loadedXml, data: 'data:image/svg+xml,' + encodeURIComponent(svg)
    }), '*');
  }
  if (message.fixtureCommand === 'emit') {
    parent.postMessage(JSON.stringify(message.data), '*');
  }
  if (message.fixtureCommand === 'edit') loadedXml = message.xml;
  if (message.fixtureCommand === 'inspect' && loadedXml) {
    parent.postMessage(JSON.stringify({ event: 'fixture-state', xml: loadedXml }), '*');
  }
});
parent.postMessage(JSON.stringify({ event: 'init' }), '*');
</script>`;

export const drawioProtocolFixtureCommands = {
	installDrawioProtocolFixture: defineBrowserCommand(async ({ page }: BrowserCommandContext) => {
		const handler = async (route: import('playwright').Route): Promise<void> =>
			await route.fulfill({ status: 200, contentType: 'text/html', body: html });
		handlers.set(page, handler);
		await page.route(fixtureUrl, handler);
	}),
	removeDrawioProtocolFixture: defineBrowserCommand(async ({ page }: BrowserCommandContext) => {
		const handler = handlers.get(page);
		if (handler) {
			await page.unroute(fixtureUrl, handler);
			handlers.delete(page);
		}
	})
};

declare module 'vitest/browser' {
	interface BrowserCommands {
		installDrawioProtocolFixture(): Promise<void>;
		removeDrawioProtocolFixture(): Promise<void>;
	}
}
