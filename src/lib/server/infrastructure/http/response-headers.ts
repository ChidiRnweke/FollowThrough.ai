/**
 * Headers every response carries. The app frames no page of its own (draw.io and the PDF
 * preview are frames it embeds, not frames of it), so no page may be framed: `frame-ancestors`
 * for current browsers, `X-Frame-Options` for older ones. The permissions are the features the
 * app never asks for; the clipboard stays available because copy buttons write to it.
 */
const RESPONSE_HEADERS = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-frame-options': 'DENY',
	'content-security-policy': "frame-ancestors 'none'",
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()'
} as const;

/**
 * Adds each header the response does not already set. A route that sets one keeps its own
 * value: the connector icon route sends a stricter policy of its own.
 */
export const withResponseHeaders = (response: Response): Response => {
	for (const [name, value] of Object.entries(RESPONSE_HEADERS))
		if (!response.headers.has(name)) response.headers.set(name, value);
	return response;
};
