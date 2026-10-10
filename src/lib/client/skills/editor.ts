import type { SkillEditorFiles } from '$lib/controllers/skills/editor';
import { importSkillMarkdown } from '$lib/remote/skills/skills.remote';
export class BrowserSkillEditorFiles implements SkillEditorFiles {
	async import(input: Parameters<SkillEditorFiles['import']>[0]): Promise<void> {
		await importSkillMarkdown(input);
	}
	download(content: string, filename: string): void {
		const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
		const anchor = document.createElement('a');
		try {
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
		} finally {
			anchor.remove();
			URL.revokeObjectURL(url);
		}
	}
}
