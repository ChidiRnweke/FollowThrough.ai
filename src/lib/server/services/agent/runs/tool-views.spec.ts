import { describe, expect, it } from 'vitest';
import { projectProject } from './tool-views';

describe('agent tool views', () => {
	it('projects only stable project fields', () => {
		expect(projectProject({ id: 'p', name: 'Project' } as never)).toEqual({
			id: 'p',
			name: 'Project'
		});
	});
});
