export function safeReturnUrl(value: string | null, fallback = '/todos'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	if (!URL.canParse(value, 'https://followthrough.local')) return fallback;
	const url = new URL(value, 'https://followthrough.local');
	if (url.origin !== 'https://followthrough.local') return fallback;
	return `${url.pathname}${url.search}${url.hash}`;
}
