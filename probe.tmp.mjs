import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewportSize: { width: 1280, height: 900 } });
p.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:4510/FollowThrough.ai/subsystems/memory/', { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
console.log(await p.evaluate(() => {
  const s = document.querySelector('.ft-mermaid .mermaid-light svg');
  const c = s.parentElement;
  return JSON.stringify({ style: s.getAttribute('style'), w: s.getAttribute('width'),
    rect: Math.round(s.getBoundingClientRect().width),
    parentOverflow: getComputedStyle(c).overflowX, parentDisplay: getComputedStyle(c).display,
    scrollW: c.scrollWidth, clientW: c.clientWidth }, null, 1);
}));
await b.close();
