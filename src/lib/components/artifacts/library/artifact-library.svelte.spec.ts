import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ArtifactLibrary, { type ArtifactLibraryData } from './artifact-library.svelte';
import type { ArtifactId, ArtifactView } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;

const artifact = (overrides: Partial<ArtifactView> = {}): ArtifactView => ({
	id: '20000000-0000-4000-8000-000000000001' as ArtifactId,
	userId: '30000000-0000-4000-8000-000000000001' as ArtifactView['userId'],
	projectId,
	title: 'Project brief',
	format: 'docx',
	objectKey: 'brief.docx',
	byteSize: 1024,
	sourceNoteIds: [],
	createdAt: '2026-07-12T08:00:00.000Z' as ArtifactView['createdAt'],
	projectName: 'FollowThrough',
	...overrides
});

const data = (overrides: Partial<ArtifactLibraryData> = {}): ArtifactLibraryData => ({
	artifacts: [artifact()],
	total: 1,
	query: '',
	page: 1,
	pageSize: 20,
	selectedProjectId: projectId,
	...overrides
});

describe('ArtifactLibrary states', () => {
	it('renders artifacts with their format badge', async () => {
		const screen = await render(ArtifactLibrary, { data: data() });
		const titles = ['Project brief', 'DOCX'].map((label) => screen.getByText(label));
		expect(
			(await Promise.all(titles.map((locator) => locator.all()))).every((found) => found.length > 0)
		).toBe(true);
	});

	it('flags a stale artifact as source-changed', async () => {
		const screen = await render(ArtifactLibrary, {
			data: data({ artifacts: [artifact({ stale: true })] })
		});
		expect(await screen.getByText('Source changed').all()).not.toHaveLength(0);
	});

	it('shows the empty state without a selected project', async () => {
		const screen = await render(ArtifactLibrary, { data: data({ selectedProjectId: null }) });
		expect(await screen.getByText('Select a project to see its artifacts.').all()).not.toHaveLength(
			0
		);
	});
});
