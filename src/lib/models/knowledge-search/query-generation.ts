import { z } from 'zod';

/** A rewritten search query as the evaluation cache stores it. */
export const cachedSearchQuerySchema = z.string();
/** The model that rewrites a conversation into one search query. */
export const DEFAULT_SEARCH_QUERY_MODEL = 'deepseek/deepseek-v4-flash';
