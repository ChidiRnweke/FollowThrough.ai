import DOMPurify from 'dompurify';

export const createMermaidConfig = (dark: boolean) => ({
	startOnLoad: false,
	theme: dark ? ('dark' as const) : ('default' as const),
	securityLevel: 'strict' as const,
	htmlLabels: false,
	fontFamily: 'inherit'
});

export const sanitizeMermaidSvg = (svg: string): string =>
	DOMPurify.sanitize(svg, {
		USE_PROFILES: { svg: true, svgFilters: true }
	});
