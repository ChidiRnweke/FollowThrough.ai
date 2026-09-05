import { z } from 'zod';

/**
 * What a row of `agent_session_items` holds.
 *
 * The column is `jsonb` and nothing parsed it. The row was asserted straight
 * into the provider SDK's `AgentInputItem` union at two call sites — a double
 * cast, so zero checks — and every module that needed one fact out of an item
 * recovered a different fragment of the shape for itself: the buffer rebuilt
 * every object recursively to find an image, `rewind` declared its own
 * `Record<string, unknown>` alias to read `role`, `canvas-source` wrote a zod
 * schema for `output.text` alone plus a comment explaining why it could not name
 * the SDK type, and the replay virtualizer read `callId` or `call_id` because
 * nobody had decided which one a row carries.
 *
 * This union is that decision. It is parsed once, in the repository mapper, and
 * mapped to the SDK type only inside the two `Session` implementations.
 *
 * The arms are what this application actually persists, measured rather than
 * guessed: across the stored rows there are exactly four item types —
 * `reasoning`, `message`, `function_call`, `function_call_result` — every
 * `function_call_result.output` is a `{ type: 'text' }` part, every assistant
 * message is `output_text` parts, and every user message is a bare string.
 * Image parts are absent because the conversation buffer replaces them on the
 * way to storage, but the code that writes them is live, so `input_image` is
 * modelled too.
 *
 * The SDK's union is wider than this — `input_file`, `audio`, hosted tool calls,
 * system messages, object-form image references. Those are not modelled, because
 * nothing here produces one, and a schema written for a shape no producer emits
 * is a guess maintained forever. If one ever arrives it lands in
 * {@link UnrecognisedSessionItem}, which is visible and lossless, and is the
 * reason a narrow set of arms is safe to commit to.
 */

/**
 * A JSON value, for the two places a shape is genuinely the provider's and not
 * ours: `providerData`, and an item this union does not recognise.
 *
 * `models/agent/payload.ts` names the same idea for the client. This is not that
 * type and cannot import it, because a model domain does not import its own
 * siblings. The duplication is the cost of that rule and is deliberate.
 */
export type SessionJson =
	string | number | boolean | null | readonly SessionJson[] | SessionJsonObject;

export interface SessionJsonObject {
	readonly [key: string]: SessionJson;
}

const sessionJsonSchema: z.ZodType<SessionJson> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(sessionJsonSchema),
		z.record(z.string(), sessionJsonSchema)
	])
);

export const sessionJsonObjectSchema: z.ZodType<SessionJsonObject> = z.record(
	z.string(),
	sessionJsonSchema
);

/**
 * A JSON object, or nothing — for a caller holding a value it has already
 * decoded and needs to know the shape of, such as a tool call's `arguments`.
 * Absence means "not an object", which is a fact the caller acts on, not a
 * failure it has to guess at.
 */
// audit-allow: no-unknown-type — Session JSON off a stored row, before any arm has been chosen.
export const readSessionJsonObject = (value: unknown): SessionJsonObject | undefined => {
	const parsed = sessionJsonObjectSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
};

/**
 * The provider's own bag, passed through untouched.
 *
 * A genuine open-keyed map rather than a struct substitute: the keys belong to
 * whichever provider served the turn, this code never reads one, and dropping
 * them would corrupt the history replayed back to that provider.
 */
export type ProviderData = Readonly<Record<string, SessionJson>>;

const providerData = { providerData: z.record(z.string(), sessionJsonSchema).optional() };

export interface InputTextPart {
	readonly type: 'input_text';
	readonly text: string;
	readonly providerData?: ProviderData;
}

/**
 * `image` is the string form only: a data URL, an https URL, or the placeholder
 * the buffer leaves in place of one. The SDK also allows an object reference,
 * which nothing here sends.
 */
export interface InputImagePart {
	readonly type: 'input_image';
	readonly image: string;
	readonly detail?: string;
	readonly providerData?: ProviderData;
}

export type UserContentPart = InputTextPart | InputImagePart;

export interface OutputTextPart {
	readonly type: 'output_text';
	readonly text: string;
	readonly providerData?: ProviderData;
}

export interface RefusalPart {
	readonly type: 'refusal';
	readonly refusal: string;
	readonly providerData?: ProviderData;
}

export type AssistantContentPart = OutputTextPart | RefusalPart;

/** The text half of a tool result, in the shape the provider chose to send it. */
export interface TextOutputPart {
	readonly type: 'text';
	readonly text: string;
	readonly providerData?: ProviderData;
}

export interface ReasoningTextPart {
	readonly type: 'reasoning_text';
	readonly text: string;
	readonly providerData?: ProviderData;
}

export interface UserMessageSessionItem {
	readonly type: 'user_message';
	readonly id?: string;
	/** A bare string in every stored row; the parts form is what the app sends when an image rides along. */
	readonly content: string | readonly UserContentPart[];
	readonly providerData?: ProviderData;
}

export interface AssistantMessageSessionItem {
	readonly type: 'assistant_message';
	readonly id?: string;
	readonly status: MessageStatus;
	readonly content: readonly AssistantContentPart[];
	readonly providerData?: ProviderData;
}

export interface FunctionCallSessionItem {
	readonly type: 'function_call';
	readonly id?: string;
	readonly callId: string;
	readonly name: string;
	/**
	 * JSON, as a string. The provider sends it this way, and the envelope is all
	 * this union claims to know — which fields a given tool takes belongs to the
	 * tool contract, not here.
	 */
	readonly arguments: string;
	readonly status?: MessageStatus;
	readonly providerData?: ProviderData;
}

export interface FunctionCallResultSessionItem {
	readonly type: 'function_call_result';
	readonly id?: string;
	readonly callId: string;
	readonly name: string;
	readonly status: MessageStatus;
	readonly output: string | TextOutputPart | readonly TextOutputPart[];
	readonly providerData?: ProviderData;
}

export interface ReasoningSessionItem {
	readonly type: 'reasoning';
	readonly id?: string;
	readonly content: readonly InputTextPart[];
	readonly rawContent?: readonly ReasoningTextPart[];
	readonly providerData?: ProviderData;
}

/**
 * A row this union does not recognise, kept whole.
 *
 * An arm rather than a thrown error because the rows were written by a provider
 * SDK on a version this code does not pin. A strictly closed union would turn
 * any upgrade that adds an item type into a data incident: every conversation
 * containing one becomes unreadable, and the user loses a history sitting intact
 * in the column. An arm rather than a silent passthrough because a reader must
 * not be able to mistake it for something that parsed — every consumer branches
 * on it, and the ones that restructure items leave it alone rather than
 * inventing a repair for a shape they did not understand.
 *
 * `raw` round-trips back to storage and to the provider unchanged.
 */
export interface UnrecognisedSessionItem {
	readonly type: 'unrecognised';
	readonly raw: SessionJsonObject;
	/** Why it did not match, for the operator reading a log or a span. */
	readonly reason: string;
}

export type MessageStatus = 'in_progress' | 'completed' | 'incomplete';

export type PersistedSessionItem =
	| UserMessageSessionItem
	| AssistantMessageSessionItem
	| FunctionCallSessionItem
	| FunctionCallResultSessionItem
	| ReasoningSessionItem
	| UnrecognisedSessionItem;

const messageStatusSchema = z.enum(['in_progress', 'completed', 'incomplete']);

const inputTextPartSchema = z
	.object({ type: z.literal('input_text'), text: z.string(), ...providerData })
	.strict();

const inputImagePartSchema = z
	.object({
		type: z.literal('input_image'),
		image: z.string(),
		detail: z.string().optional(),
		...providerData
	})
	.strict();

const outputTextPartSchema = z
	.object({ type: z.literal('output_text'), text: z.string(), ...providerData })
	.strict();

const refusalPartSchema = z
	.object({ type: z.literal('refusal'), refusal: z.string(), ...providerData })
	.strict();

const textOutputPartSchema = z
	.object({ type: z.literal('text'), text: z.string(), ...providerData })
	.strict();

const reasoningTextPartSchema = z
	.object({ type: z.literal('reasoning_text'), text: z.string(), ...providerData })
	.strict();

/**
 * `call_id` is accepted beside `callId` and normalised away here.
 *
 * The replay virtualizer read both spellings and hashed the whole item when it
 * found neither — a fallback standing in for a fact the row either has or does
 * not. Normalising at the parse zone is what lets that fallback go: past this
 * point a call has one identifier, spelled one way.
 */
const callIdentity = {
	callId: z.string().optional(),
	call_id: z.string().optional()
};

const resolveCallId = <Value extends { readonly callId?: string; readonly call_id?: string }>(
	value: Value,
	ctx: z.RefinementCtx
): (Value & { readonly callId: string }) | typeof z.NEVER => {
	const callId = value.callId ?? value.call_id;
	if (callId === undefined) {
		ctx.addIssue({ code: 'custom', path: ['callId'], message: 'A tool item must carry a call id' });
		return z.NEVER;
	}
	return { ...value, callId };
};

/**
 * The stored spelling of a message: `type: 'message'` plus a `role`. The union
 * splits the two roles into arms because they carry different content and, for
 * the assistant, a required status.
 */
const storedUserMessageSchema = z
	.object({
		type: z.literal('message').optional(),
		role: z.literal('user'),
		id: z.string().optional(),
		content: z.union([z.string(), z.array(z.union([inputTextPartSchema, inputImagePartSchema]))]),
		...providerData
	})
	.strict();

const storedAssistantMessageSchema = z
	.object({
		type: z.literal('message').optional(),
		role: z.literal('assistant'),
		id: z.string().optional(),
		status: messageStatusSchema,
		content: z.array(z.union([outputTextPartSchema, refusalPartSchema])),
		...providerData
	})
	.strict();

const storedFunctionCallSchema = z
	.object({
		type: z.literal('function_call'),
		id: z.string().optional(),
		name: z.string(),
		arguments: z.string(),
		status: messageStatusSchema.optional(),
		...callIdentity,
		...providerData
	})
	.strict()
	.transform(resolveCallId);

const storedFunctionCallResultSchema = z
	.object({
		type: z.literal('function_call_result'),
		id: z.string().optional(),
		name: z.string(),
		status: messageStatusSchema,
		output: z.union([z.string(), textOutputPartSchema, z.array(textOutputPartSchema)]),
		...callIdentity,
		...providerData
	})
	.strict()
	.transform(resolveCallId);

const storedReasoningSchema = z
	.object({
		type: z.literal('reasoning'),
		id: z.string().optional(),
		content: z.array(inputTextPartSchema),
		rawContent: z.array(reasoningTextPartSchema).optional(),
		...providerData
	})
	.strict();

/**
 * An absent optional stays absent, rather than becoming a present `undefined`.
 *
 * These items are written back to `jsonb` and replayed to the provider, so a key
 * that was not there must not appear, and `JSON.stringify` is not the only path
 * a row takes.
 */
const present = <Value>(key: string, value: Value | undefined) =>
	value === undefined ? {} : { [key]: value };

// audit-allow: no-unknown-type — Tries each persisted arm against a row nothing has parsed.
const recognise = (value: unknown): PersistedSessionItem | undefined => {
	const user = storedUserMessageSchema.safeParse(value);
	if (user.success)
		return {
			type: 'user_message',
			content: user.data.content,
			...present('id', user.data.id),
			...present('providerData', user.data.providerData)
		};
	const assistant = storedAssistantMessageSchema.safeParse(value);
	if (assistant.success)
		return {
			type: 'assistant_message',
			status: assistant.data.status,
			content: assistant.data.content,
			...present('id', assistant.data.id),
			...present('providerData', assistant.data.providerData)
		};
	const call = storedFunctionCallSchema.safeParse(value);
	if (call.success)
		return {
			type: 'function_call',
			callId: call.data.callId,
			name: call.data.name,
			arguments: call.data.arguments,
			...present('id', call.data.id),
			...present('status', call.data.status),
			...present('providerData', call.data.providerData)
		};
	const result = storedFunctionCallResultSchema.safeParse(value);
	if (result.success)
		return {
			type: 'function_call_result',
			callId: result.data.callId,
			name: result.data.name,
			status: result.data.status,
			output: result.data.output,
			...present('id', result.data.id),
			...present('providerData', result.data.providerData)
		};
	const reasoning = storedReasoningSchema.safeParse(value);
	if (reasoning.success)
		return {
			type: 'reasoning',
			content: reasoning.data.content,
			...present('rawContent', reasoning.data.rawContent),
			...present('id', reasoning.data.id),
			...present('providerData', reasoning.data.providerData)
		};
	return undefined;
};

/**
 * A stored row, as one of the arms.
 *
 * Throws only when the value is not a JSON object at all: that is a corrupt
 * column rather than an item shape this code has not met, and there is nothing
 * worth preserving. Everything else settles into an arm, so a conversation stays
 * readable.
 */
// audit-allow: no-unknown-type — The repository read boundary for agent_session_items.
export const parseSessionItem = (value: unknown): PersistedSessionItem => {
	const recognised = recognise(value);
	if (recognised) return recognised;
	const raw = sessionJsonObjectSchema.safeParse(value);
	if (!raw.success)
		throw new Error(`A session item must be a JSON object: ${raw.error.issues[0]?.message}`);
	const type = raw.data.type;
	return {
		type: 'unrecognised',
		raw: raw.data,
		reason:
			typeof type === 'string'
				? `No arm matches a stored item of type '${type}'`
				: 'A stored item carries no recognisable type'
	};
};

/** What the two `message` arms share with their stored spelling. */
type StoredMessage = {
	readonly type: 'message';
	readonly role: 'user' | 'assistant';
	readonly id?: string;
	readonly status?: MessageStatus;
	readonly content: string | readonly (UserContentPart | AssistantContentPart)[];
	readonly providerData?: ProviderData;
};

type StoredTool = {
	readonly type: 'function_call' | 'function_call_result';
	readonly callId: string;
	readonly name: string;
	readonly id?: string;
	readonly status?: MessageStatus;
	readonly arguments?: string;
	readonly output?: string | TextOutputPart | readonly TextOutputPart[];
	readonly providerData?: ProviderData;
};

type StoredReasoning = {
	readonly type: 'reasoning';
	readonly id?: string;
	readonly content: readonly InputTextPart[];
	readonly rawContent?: readonly ReasoningTextPart[];
	readonly providerData?: ProviderData;
};

export type StoredSessionItem = StoredMessage | StoredTool | StoredReasoning | SessionJsonObject;

/** The row as it is written back: the shape the provider sent, restored exactly. */
export const toStoredSessionItem = (item: PersistedSessionItem): StoredSessionItem => {
	switch (item.type) {
		case 'user_message':
			return {
				type: 'message',
				role: 'user',
				content: item.content,
				...present('id', item.id),
				...present('providerData', item.providerData)
			};
		case 'assistant_message':
			return {
				type: 'message',
				role: 'assistant',
				status: item.status,
				content: item.content,
				...present('id', item.id),
				...present('providerData', item.providerData)
			};
		case 'function_call':
			return {
				type: 'function_call',
				callId: item.callId,
				name: item.name,
				arguments: item.arguments,
				...present('id', item.id),
				...present('status', item.status),
				...present('providerData', item.providerData)
			};
		case 'function_call_result':
			return {
				type: 'function_call_result',
				callId: item.callId,
				name: item.name,
				status: item.status,
				output: item.output,
				...present('id', item.id),
				...present('providerData', item.providerData)
			};
		case 'reasoning':
			return {
				type: 'reasoning',
				content: item.content,
				...present('rawContent', item.rawContent),
				...present('id', item.id),
				...present('providerData', item.providerData)
			};
		case 'unrecognised':
			return item.raw;
	}
};

/**
 * The text a tool result carries, whichever of the three shapes it arrived in.
 *
 * `'type' in output` rather than `!Array.isArray(output)`: `Array.isArray`
 * narrows to `any[]`, which a `readonly` array member is not assignable to, so
 * the array would survive into the object branch. The key test discriminates the
 * union the compiler can actually check.
 */
export const sessionOutputText = (item: FunctionCallResultSessionItem): string | undefined => {
	const { output } = item;
	if (typeof output === 'string') return output;
	return 'type' in output ? output.text : undefined;
};
