import { describe, expect, it } from 'vitest';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

// ADR 0008: search entries record their project and project-scoped reads stay inside it.
// ADR 0009 (archived projects hidden) is proven on the real engine by
// tests/integration/knowledge-search/project-visibility.contract.spec.ts.
describe('project-scoped knowledge search', () => {
	it('returns only chunks of the requested project', async () => {
		const { controller, repository } = searchControllerFixture();
		const userId = testActor().userId;
		const first = testProjectId(1);
		const second = testProjectId(2);
		repository.documents = [
			{ userId, document: searchDocumentBuilder({ projectId: first, content: 'first project' }) },
			{ userId, document: searchDocumentBuilder({ projectId: second, content: 'second project' }) }
		];
		const results = await controller.search({ query: 'project', projectId: second });
		expect(results.map((match) => match.content)).toEqual(['second project']);
	});
});
