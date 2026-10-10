import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import { todoBoardFilterSchema } from '$lib/models/todos';
/** PDF uses shareable filters; Markdown exports the locally visible cards. */
export const exportBoardPdf = command(todoBoardFilterSchema, async (input) =>
	AppFactory.controllers().todos().exportBoardPdf(requestActor(), input)
);
