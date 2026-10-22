export interface AuthUser {
  id: string;
}

export interface AccessTokenPayload {
  sub: string;
  iat?: number;
  iatMs?: number;
  exp?: number;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
