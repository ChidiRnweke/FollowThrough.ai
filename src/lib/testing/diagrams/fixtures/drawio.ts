export const VALID_DRAWIO_XML =
	'<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="API &amp; worker" vertex="1" parent="1"><mxGeometry x="10" y="20" width="120" height="40" as="geometry"/></mxCell><mxCell id="3" edge="1" parent="1" source="2" target="2"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';

/**
 * Hand-written draw.io documents, small enough to read.
 *
 * The diagram rules are checked against XML built here rather than against
 * recorded agent output, because a rule is only trustworthy if something has
 * been shown to make it fire. Each spec writes the smallest document that breaks
 * exactly one rule, which is a document nobody would ever produce by accident.
 */

export const mxfile = (body: string): string =>
	`<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${body}</root></mxGraphModel></diagram></mxfile>`;

export interface VertexFixture {
	readonly id: string;
	readonly value?: string;
	readonly x?: number;
	readonly y?: number;
	readonly width?: number;
	readonly height?: number;
	readonly style?: string;
	readonly parent?: string;
}

export const vertex = ({
	id,
	value = '',
	x = 0,
	y = 0,
	width = 120,
	height = 60,
	style = 'rounded=0;whiteSpace=wrap;html=1;',
	parent = '1'
}: VertexFixture): string =>
	`<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`;

export interface EdgeFixture {
	readonly id: string;
	readonly source?: string;
	readonly target?: string;
	readonly value?: string;
	readonly style?: string;
	/** Fixed endpoints, for the edge that only looks connected. */
	readonly sourcePoint?: { readonly x: number; readonly y: number };
	readonly targetPoint?: { readonly x: number; readonly y: number };
	readonly waypoints?: readonly { readonly x: number; readonly y: number }[];
}

export const edge = ({
	id,
	source,
	target,
	value = '',
	style = 'edgeStyle=orthogonalEdgeStyle;html=1;',
	sourcePoint,
	targetPoint,
	waypoints = []
}: EdgeFixture): string => {
	const ends = [source ? ` source="${source}"` : '', target ? ` target="${target}"` : ''].join('');
	const points = [
		sourcePoint ? `<mxPoint x="${sourcePoint.x}" y="${sourcePoint.y}" as="sourcePoint"/>` : '',
		targetPoint ? `<mxPoint x="${targetPoint.x}" y="${targetPoint.y}" as="targetPoint"/>` : '',
		waypoints.length
			? `<Array as="points">${waypoints.map((point) => `<mxPoint x="${point.x}" y="${point.y}"/>`).join('')}</Array>`
			: ''
	].join('');
	return `<mxCell id="${id}" value="${value}" style="${style}" edge="1" parent="1"${ends}><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`;
};

/**
 * A cell whose label lives on a rich-text wrapper rather than on the cell.
 *
 * The id stays on the inner `mxCell` because `DrawioXmlValidator` requires one
 * there, so this is the wrapped shape production actually accepts.
 */
export const wrappedVertex = ({ id, value = '', ...geometry }: VertexFixture): string =>
	`<object label="${value}">${vertex({ id, ...geometry })}</object>`;
