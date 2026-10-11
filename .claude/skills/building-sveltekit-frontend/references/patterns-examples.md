# Stateless services and complete controller operations

These examples show ownership, not a new feature template. Follow the capability's actual model,
repository and transport contracts. ADR 0007 takes precedence over older examples.

A shared service takes resolved facts and returns a domain decision. Its collaborators and
configuration are immutable; intermediate state exists only for the operation.

```typescript
export interface ITitleEditingService {
  decide(current: NoteTitle, requested: string): TitleDecision;
}

export class TitleEditingService implements ITitleEditingService {
  decide(current: NoteTitle, requested: string): TitleDecision {
    const title = requested.trim();
    if (!title) return { kind: 'invalid', message: 'A title is required' };
    return { kind: 'edit', value: { ...current, title } };
  }
}
```

A controller owns the read, rule and write within the transaction. It exposes the complete
operation. The component cannot read the repository or call the rule separately.

```typescript
export interface NoteTitleController {
  rename(id: NoteId, title: string): Promise<NoteTitle>;
}

export class NoteTitles implements NoteTitleController {
  constructor(
    private readonly records: NoteTitleRepository,
    private readonly editing: ITitleEditingService,
    private readonly transaction: AtomicOperation
  ) {}

  rename(id: NoteId, title: string): Promise<NoteTitle> {
    return this.transaction.run(async () => {
      const current = await this.records.getForEdit(id);
      const decision = this.editing.decide(current, title);
      if (decision.kind === 'invalid') throw new ValidationError(decision.message);
      return this.records.save(decision.value);
    });
  }
}
```

Factories instantiate and connect these dependencies. Their result is `NoteTitleController`, not
`NoteTitles`, the repository, or an object exposing every collaborator. Server capabilities keep
construction inside their capability factory. Browser capabilities expose controllers and readonly
state with a defined lifetime.

A store retains state and applies controlled updates. It does not fetch its own records, interpret
an edit, enqueue a write or start a retry. A controller performs those operations and updates it.

```typescript
export interface NoteTitleState {
  readonly current: NoteTitle | undefined;
}

export class NoteTitleStore implements NoteTitleState {
  private value = $state<NoteTitle>();
  get current(): NoteTitle | undefined { return this.value; }
  replace(value: NoteTitle): void { this.value = value; }
  clear(): void { this.value = undefined; }
}
```

Only the controller gets the mutable store. Components observe `NoteTitleState` and keep transient
form fields locally. Their submit handler calls `controller.rename(id, title)`.

Boundary readers own parsing. For JSON patch editing, the controller asks a patch service for a
candidate, passes it to an injected candidate reader, then calls the semantic editing service.
Creation skips patch preparation. Both paths return the same complete result or structured failure.
No service parses a candidate or calls another service through a callback.

Behavior tests construct services directly or inject shared in-memory repositories into controllers.
Assert the resulting value, error or persisted state. Do not expose a private helper to preserve a
test or assert which collaborator was called.
