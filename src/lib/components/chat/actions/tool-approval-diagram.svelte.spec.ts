import { describe, expect, it } from 'vitest';
import { approvalPreview } from './tool-approval-preview';

// Runs in a browser, not node: reading a diagram's labels needs `DOMParser`, and
// the labels are the whole point of this preview. The pure note and settings
// cases stay in `tool-approval-preview.spec.ts`.
// Approving a diagram used to mean reading a wall of mxfile markup: the card had
// arms for notes and settings and dumped the arguments for everything else.
describe('Previewing a pending diagram change', () => {
	const mxfile = (...labels: readonly string[]) =>
		`<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${labels
			.map((label, index) => `<mxCell id="${index + 2}" parent="1" value="${label}"/>`)
			.join('')}</root></mxGraphModel></diagram></mxfile>`;

	it('lists what a new diagram will contain', () => {
		const preview = approvalPreview(
			'create_diagram',
			{ source: mxfile('Browser', 'Database'), title: 'Architecture' },
			{ kind: 'none' }
		);
		expect(preview.kind === 'diagram' && preview.change).toMatchObject({
			kind: 'created',
			labels: ['Browser', 'Database']
		});
	});

	it('names what an edit adds', () => {
		const preview = approvalPreview(
			'edit_diagram',
			{ source: mxfile('Browser', 'Database', 'Cache') },
			{ kind: 'diagram', labels: ['Browser', 'Database'], title: 'Architecture' }
		);
		expect(
			preview.kind === 'diagram' && preview.change.kind === 'edited' && preview.change.added
		).toEqual(['Cache']);
	});

	it('names what an edit removes', () => {
		const preview = approvalPreview(
			'edit_diagram',
			{ source: mxfile('Browser') },
			{ kind: 'diagram', labels: ['Browser', 'Database'], title: 'Architecture' }
		);
		expect(
			preview.kind === 'diagram' && preview.change.kind === 'edited' && preview.change.removed
		).toEqual(['Database']);
	});

	it('counts the labels an edit leaves alone', () => {
		const preview = approvalPreview(
			'edit_diagram',
			{ source: mxfile('Browser', 'Cache') },
			{ kind: 'diagram', labels: ['Browser', 'Database'], title: 'Architecture' }
		);
		expect(
			preview.kind === 'diagram' && preview.change.kind === 'edited' && preview.change.kept
		).toBe(1);
	});

	// Without the before-image an edit cannot claim anything was added, so it says
	// what the diagram will contain instead of inventing a delta.
	it('describes an edit with no before-image as what it will contain', () => {
		const preview = approvalPreview(
			'edit_diagram',
			{ source: mxfile('Browser'), title: 'Architecture' },
			{ kind: 'none' }
		);
		expect(preview.kind === 'diagram' && preview.change.kind).toBe('created');
	});

	it('says so when the proposed diagram cannot be read', () => {
		const preview = approvalPreview(
			'create_diagram',
			{ source: 'not xml at all' },
			{ kind: 'none' }
		);
		expect(preview.kind === 'diagram' && preview.change.kind).toBe('unreadable');
	});

	it('reads a rich-text label as the words it shows', () => {
		const preview = approvalPreview(
			'create_diagram',
			{ source: mxfile('&lt;b&gt;Browser&lt;/b&gt;') },
			{ kind: 'none' }
		);
		expect(
			preview.kind === 'diagram' && preview.change.kind === 'created' && preview.change.labels
		).toEqual(['Browser']);
	});
});
