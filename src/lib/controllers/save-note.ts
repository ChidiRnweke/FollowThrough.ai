import type { ActorContext, SaveNoteInput, SaveNoteOutput } from '../models';
import type { TransactionRunner } from '../repositories';
import type {
	NoteEditor,
	NoteIndexer,
	NoteRevisionRecorder,
	SourceAnchorRepairer
} from '../services';
export interface SaveNoteDependencies {
	noteEditor: NoteEditor;
	revisionRecorder: NoteRevisionRecorder;
	anchorRepairer: SourceAnchorRepairer;
	noteIndexer: NoteIndexer;
	transactionRunner: TransactionRunner;
}
export class DefaultSaveNoteController {
	constructor(private readonly dependencies: SaveNoteDependencies) {}
	execute(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteEditor.save(actor, input.note);
			await this.dependencies.revisionRecorder.record(actor, note);
			const anchors = await this.dependencies.anchorRepairer.repairForNote(actor, note);
			await this.dependencies.noteIndexer.index(actor, note);
			return { note, repairedAnchorIds: anchors.map((anchor) => anchor.id) };
		});
	}
}
