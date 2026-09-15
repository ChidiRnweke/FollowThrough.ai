import { z } from 'zod';

export const oauthTokensSchema = z.object({
	access_token: z.string().min(1),
	token_type: z.string(),
	expires_in: z.number(),
	id_token: z.string().optional()
});
export type OAuthTokens = z.infer<typeof oauthTokensSchema>;

export const oauthUserInfoSchema = z.object({
	sub: z.string().min(1),
	email: z.string().min(1),
	email_verified: z.boolean(),
	name: z.string().optional(),
	picture: z.string().optional(),
	nickname: z.string().optional()
});
export type OAuthUserInfo = z.infer<typeof oauthUserInfoSchema>;

export interface PKCEChallenge {
	readonly codeChallenge: string;
	readonly codeVerifier: string;
	readonly state: string;
}
