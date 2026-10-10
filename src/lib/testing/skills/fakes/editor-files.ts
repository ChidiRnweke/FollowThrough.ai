import type { SkillEditorFiles } from '$lib/controllers/skills/editor';
export class InMemorySkillEditorFiles implements SkillEditorFiles {
	readonly downloads: { content: string; filename: string }[] = [];
	readonly imports: Parameters<SkillEditorFiles['import']>[0][] = [];
	failure: Error | undefined;
	async import(input: Parameters<SkillEditorFiles['import']>[0]): Promise<void> {
		if (this.failure) throw this.failure;
		this.imports.push(input);
	}
	download(content: string, filename: string): void {
		if (this.failure) throw this.failure;
		this.downloads.push({ content, filename });
	}
}
