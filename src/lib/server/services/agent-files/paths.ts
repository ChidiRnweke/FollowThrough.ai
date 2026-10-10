import type { AgentFilePaths as AgentFilePathsContract } from '$lib/models/agent-files';
import type { AttachmentId } from '$lib/models/attachments';
import type { Diagram } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

interface AgentFilePaths {
	normalize: AgentFilePathsContract['normalize'];
	note: AgentFilePathsContract['note'];
	revision: AgentFilePathsContract['revision'];
	attachment: AgentFilePathsContract['attachment'];
	diagram: AgentFilePathsContract['diagram'];
}

export class AgentFilePathsService implements AgentFilePaths {
	normalize(input: string): string {
		const absolute = input === '.' ? '/' : input.startsWith('/') ? input : `/${input}`;
		const parts: string[] = [];
		for (const part of absolute.split('/')) {
			if (part === '' || part === '.') continue;
			if (part === '..') parts.pop();
			else parts.push(part);
		}
		return `/${parts.join('/')}`;
	}

	note(projectId: ProjectId, noteId: NoteId): string {
		return `/projects/${projectId}/notes/${noteId}.md`;
	}
	revision(projectId: ProjectId, noteId: NoteId, revision: number): string {
		return `/projects/${projectId}/notes/${noteId}/versions/${revision}.md`;
	}
	attachment(projectId: ProjectId, attachmentId: AttachmentId): string {
		return `/projects/${projectId}/attachments/${attachmentId}.txt`;
	}
	diagram(diagram: Pick<Diagram, 'projectId' | 'id' | 'kind'>): string {
		return `/projects/${diagram.projectId}/diagrams/${diagram.id}.${diagram.kind === 'mermaid' ? 'mmd' : 'drawio'}`;
	}
}
