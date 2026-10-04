import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import type { PreparedExport } from '$lib/models/deliverables';
import { widgetTemplates } from '$lib/models/widgets';
import { generateDocx } from '$lib/server/services/deliverables/docx';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProjectId,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

const input = {
	projectId: testProjectId(),
	noteIds: [testNoteId()],
	title: 'Launch',
	format: 'docx' as const
};

const ticked = widgetBuilder({
	data: {
		...widgetTemplates.checklist.data,
		items: [{ id: 'a', label: 'Ship the beta', done: true }]
	}
});

const setup = (widget = ticked, overrides: Parameters<typeof exportControllerFixture>[0] = {}) => {
	const fixture = exportControllerFixture(overrides);
	fixture.widgets.widgets = [widget];
	fixture.notes.notes = [
		noteBuilder({
			document: { type: 'doc', content: [{ type: 'widgetNode', attrs: { widgetId: widget.id } }] }
		})
	];
	return fixture;
};

describe('widgets in document exports', () => {
	it('hands the renderer each embedded widget as the blocks it showed', async () => {
		const prepared: PreparedExport[] = [];
		const { service } = setup(ticked, {
			pdfGenerator: async (value) => {
				prepared.push(value);
				return Buffer.from('pdf');
			}
		});
		await service.generateDocument(testActor(), { ...input, format: 'pdf' });
		expect(prepared[0]?.widgets.get(ticked.id)?.blocks).toEqual([
			{ kind: 'heading', text: 'Checklist', level: 3 },
			{ kind: 'check', label: 'Ship the beta', checked: true }
		]);
	});
	it('writes a ticked item into the Word document', async () => {
		const written: Buffer[] = [];
		const { service } = setup(ticked, {
			docxGenerator: async (value) => {
				const bytes = await generateDocx(value);
				written.push(bytes);
				return bytes;
			}
		});
		await service.generateDocument(testActor(), input);
		const xml = new AdmZip(written[0]).readAsText('word/document.xml');
		expect(xml).toContain('☑ Ship the beta');
	});
	it('refuses to export a note whose widget is in the trash', async () => {
		const { service } = setup(widgetBuilder({ archivedAt: testNow }));
		await expect(service.generateDocument(testActor(), input)).rejects.toThrow(
			'An exported widget is unavailable'
		);
	});
});

describe('widgets that show workspace data in exports', () => {
	it('counts the project todos as of the export', async () => {
		const prepared: PreparedExport[] = [];
		const dashboard = widgetBuilder({
			layout: widgetTemplates.dashboard.layout,
			data: widgetTemplates.dashboard.data
		});
		const fixture = setup(dashboard, {
			pdfGenerator: async (value) => {
				prepared.push(value);
				return Buffer.from('pdf');
			}
		});
		fixture.todos.todos = [
			todoBuilder({ id: testTodoId(1), title: 'Write brief' }),
			todoBuilder({ id: testTodoId(2), title: 'Book venue' }),
			todoBuilder({
				id: testTodoId(3),
				title: 'Send invites',
				status: 'done',
				completedAt: testNow
			})
		];
		await fixture.service.generateDocument(testActor(), { ...input, format: 'pdf' });
		expect(
			prepared[0]?.widgets.get(dashboard.id)?.blocks.find((block) => block.kind === 'metric')
		).toEqual({ kind: 'metric', label: 'Open todos', value: '2' });
	});
});
