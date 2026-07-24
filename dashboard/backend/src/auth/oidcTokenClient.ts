export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  idToken: string;
  expiresIn: number;
}

// Injected the same way DbClient is: a real HTTP implementation for
// production, a fake in-memory one for tests (no real IdP reachable here).
export interface OidcTokenClient {
  exchangeCode(code: string): Promise<TokenResponse>;
  refresh(refreshToken: string): Promise<TokenResponse>;
}

export interface HttpOidcConfig {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function parseTokenResponse(json: Record<string, unknown>): TokenResponse {
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: json.refresh_token !== undefined ? String(json.refresh_token) : undefined,
    idToken: String(json.id_token ?? ""),
    expiresIn: Number(json.expires_in ?? 3600),
  };
}

export function createHttpOidcTokenClient(config: HttpOidcConfig): OidcTokenClient {
  async function post(body: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      throw new Error(`OIDC token endpoint returned ${res.status}`);
    }
    return parseTokenResponse((await res.json()) as Record<string, unknown>);
  }

  return {
    exchangeCode(code: string) {
      return post({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      });
    },
    refresh(refreshToken: string) {
      return post({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
    },
  };
}
