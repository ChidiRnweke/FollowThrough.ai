export function safeReturnUrl(value: string | null, fallback = '/todos'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	try {
		const url = new URL(value, 'https://followthrough.local');
		if (url.origin !== 'https://followthrough.local') return fallback;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return fallback;
	}
}
