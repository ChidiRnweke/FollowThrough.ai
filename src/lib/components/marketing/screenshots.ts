// Captured screenshots drop into `src/lib/assets/marketing/` named after the
// slot id. Until one exists the slot renders its placeholder, so the capture
// pass (see docs/screenshots/CAPTURE_PLAN.md) is a file drop and nothing else.
const captured = import.meta.glob('$lib/assets/marketing/*.{png,jpg,jpeg,webp}', {
	eager: true,
	query: '?url',
	import: 'default'
}) as Record<string, string>;

const byId = new Map(
	Object.entries(captured).map(([path, url]) => [
		path
			.split('/')
			.pop()!
			.replace(/\.(png|jpe?g|webp)$/, ''),
		url
	])
);

export const capturedShot = (id: string): string | undefined => byId.get(id);
