// pdfmake ships without type declarations; this covers the 0.3 server API surface we use.
declare module 'pdfmake' {
	interface PdfMakeOutputDocument {
		getBuffer(): Promise<Buffer>;
		getStream(): Promise<NodeJS.ReadableStream>;
	}

	/** A bare text run is a string; any object block is content. Recurse on `text`/`stack`. */
	export type PdfContent =
		| PdfTextBlock
		| PdfImageBlock
		| PdfSvgBlock
		| PdfCanvasBlock
		| PdfTableBlock
		| PdfListBlock
		| PdfStackBlock
		| PdfRun
		| string;

	export interface PdfRun {
		readonly text: string;
		readonly font?: string;
		readonly bold?: boolean;
		readonly italics?: boolean;
		readonly link?: string;
		readonly color?: string;
		readonly decoration?: string;
	}

	export interface PdfTextBlock {
		readonly text: PdfRun | string | readonly PdfContent[];
		readonly font?: string;
		readonly fontSize?: number;
		readonly bold?: boolean;
		readonly italics?: boolean;
		readonly color?: string;
		readonly lineHeight?: number;
		readonly preserveLeadingSpaces?: boolean;
		readonly alignment?: 'left' | 'center' | 'right' | 'justify';
		readonly margin?: readonly number[];
	}

	export interface PdfImageBlock {
		readonly image: string;
		readonly width?: number;
		readonly fit?: readonly number[];
		readonly margin?: readonly number[];
	}

	export interface PdfSvgBlock {
		readonly svg: string;
		readonly fit: readonly number[];
		readonly margin?: readonly number[];
	}

	export interface PdfCanvasBlock {
		readonly canvas: readonly {
			readonly type: 'line';
			readonly x1: number;
			readonly y1: number;
			readonly x2: number;
			readonly y2: number;
			readonly lineWidth: number;
			readonly lineColor: string;
		}[];
		readonly margin?: readonly number[];
	}

	export interface PdfCellBlock extends PdfTextBlock {
		readonly colSpan?: number;
		readonly rowSpan?: number;
		readonly fillColor?: string;
	}

	export interface PdfTableBlock {
		readonly table: {
			readonly headerRows?: number;
			readonly widths: readonly (number | '*')[];
			readonly body: readonly (readonly (PdfCellBlock | Record<string, never>)[])[];
		};
		readonly layout?: {
			readonly fillColor?: string;
			readonly hLineWidth?: () => number;
			readonly vLineWidth?: () => number;
			readonly hLineColor?: string;
			readonly vLineColor?: string;
			readonly paddingLeft?: () => number;
			readonly paddingRight?: () => number;
			readonly paddingTop?: () => number;
			readonly paddingBottom?: () => number;
		};
		readonly margin?: readonly number[];
	}

	export interface PdfStackBlock {
		readonly stack: readonly PdfContent[];
	}

	export interface PdfListBlock {
		readonly ul?: readonly (PdfTextBlock | PdfStackBlock)[];
		readonly ol?: readonly (PdfTextBlock | PdfStackBlock)[];
	}

	export interface PdfDocumentDefinition {
		readonly content: readonly PdfContent[];
		readonly defaultStyle?: {
			readonly font?: string;
			readonly fontSize?: number;
			readonly lineHeight?: number;
		};
		readonly pageSize?: 'A4';
		readonly pageMargins?: readonly number[];
	}

	interface PdfMakeServer {
		addFonts(fonts: Record<string, Record<string, string>>): void;
		setFonts(fonts: Record<string, Record<string, string>>): void;
		setLocalAccessPolicy(callback: (path: string) => boolean): void;
		createPdf(docDefinition: PdfDocumentDefinition): PdfMakeOutputDocument;
	}
	const pdfmake: PdfMakeServer;
	export default pdfmake;
}
