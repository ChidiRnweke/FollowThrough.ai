export interface MermaidSyntaxReader {
	parse(source: string): Promise<void>;
}
