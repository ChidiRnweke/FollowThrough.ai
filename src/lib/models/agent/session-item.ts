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

export const sessionJsonSchema: z.ZodType<SessionJson> = z.lazy(() =>
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
	.transform((value, ctx) => {
		const callId = value.callId ?? value.call_id;
		if (callId === undefined) {
			ctx.addIssue({
				code: 'custom',
				path: ['callId'],
				message: 'A tool item must carry a call id'
			});
			return z.NEVER;
		}
		return { ...value, callId };
	});

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
	.transform((value, ctx) => {
		const callId = value.callId ?? value.call_id;
		if (callId === undefined) {
			ctx.addIssue({
				code: 'custom',
				path: ['callId'],
				message: 'A tool item must carry a call id'
			});
			return z.NEVER;
		}
		return { ...value, callId };
	});

const storedReasoningSchema = z
	.object({
		type: z.literal('reasoning'),
		id: z.string().optional(),
		content: z.array(inputTextPartSchema),
		rawContent: z.array(reasoningTextPartSchema).optional(),
		...providerData
	})
	.strict();

/** Decode storage spelling into the resolved session union at repository/provider boundaries. */
export const persistedSessionItemSchema: z.ZodType<PersistedSessionItem> = z.union([
	storedUserMessageSchema.transform((value): PersistedSessionItem => ({
		type: 'user_message',
		content: value.content,
		...(value.id === undefined ? {} : { id: value.id }),
		...(value.providerData === undefined ? {} : { providerData: value.providerData })
	})),
	storedAssistantMessageSchema.transform((value): PersistedSessionItem => ({
		type: 'assistant_message',
		status: value.status,
		content: value.content,
		...(value.id === undefined ? {} : { id: value.id }),
		...(value.providerData === undefined ? {} : { providerData: value.providerData })
	})),
	storedFunctionCallSchema.transform((value): PersistedSessionItem => ({
		type: 'function_call',
		callId: value.callId,
		name: value.name,
		arguments: value.arguments,
		...(value.id === undefined ? {} : { id: value.id }),
		...(value.status === undefined ? {} : { status: value.status }),
		...(value.providerData === undefined ? {} : { providerData: value.providerData })
	})),
	storedFunctionCallResultSchema.transform((value): PersistedSessionItem => ({
		type: 'function_call_result',
		callId: value.callId,
		name: value.name,
		status: value.status,
		output: value.output,
		...(value.id === undefined ? {} : { id: value.id }),
		...(value.providerData === undefined ? {} : { providerData: value.providerData })
	})),
	storedReasoningSchema.transform((value): PersistedSessionItem => ({
		type: 'reasoning',
		content: value.content,
		...(value.rawContent === undefined ? {} : { rawContent: value.rawContent }),
		...(value.id === undefined ? {} : { id: value.id }),
		...(value.providerData === undefined ? {} : { providerData: value.providerData })
	})),
	sessionJsonObjectSchema.transform((raw) => ({
		type: 'unrecognised' as const,
		raw,
		reason:
			typeof raw.type === 'string'
				? `No arm matches a stored item of type '${raw.type}'`
				: 'A stored item carries no recognisable type'
	}))
]);

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
