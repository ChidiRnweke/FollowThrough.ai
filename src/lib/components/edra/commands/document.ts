export interface EdraDocument {
	readonly type: 'doc';
	readonly content?: readonly Readonly<Record<string, unknown>>[];
}
