// pdfmake ships without type declarations; this covers the 0.3 server API surface we use.
declare module 'pdfmake' {
	interface PdfMakeOutputDocument {
		getBuffer(): Promise<Buffer>;
		getStream(): Promise<NodeJS.ReadableStream>;
	}
	interface PdfMakeServer {
		addFonts(fonts: Record<string, Record<string, string>>): void;
		setFonts(fonts: Record<string, Record<string, string>>): void;
		setLocalAccessPolicy(callback: (path: string) => boolean): void;
		createPdf(docDefinition: Record<string, unknown>): PdfMakeOutputDocument;
	}
	const pdfmake: PdfMakeServer;
	export default pdfmake;
}
