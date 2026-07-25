// 공개 SaaS(§Phase 1) GitHub OAuth. 인가코드 교환 + 유저 조회를 인터페이스로 추상화해
// 라우트/테스트에서 실제 HTTP 없이 주입 가능하게 한다(bitbucketClient 주입 패턴과 동일).

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
}

export interface GithubOAuthClient {
  /** code → GitHub access token */
  exchangeCode(code: string): Promise<string>;
  /** access token → GitHub user */
  fetchUser(accessToken: string): Promise<GithubUser>;
}

export interface GithubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
}

/** 사용자를 보낼 GitHub 인가 URL. */
export function githubAuthorizeUrl(cfg: GithubOAuthConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${p.toString()}`;
}

/** GitHub 유저 id를 우리 내부 userId로. 로그인명이 바뀌어도 안정적이도록 숫자 id 사용. */
export function githubUserIdToUserId(user: GithubUser): string {
  return `github:${user.id}`;
}

/** 실제 HTTP 구현(프로덕션). global fetch(Node 18+) 사용. */
export function createHttpGithubOAuth(cfg: Pick<GithubOAuthConfig, "clientId" | "clientSecret" | "redirectUri">): GithubOAuthClient {
  return {
    async exchangeCode(code: string): Promise<string> {
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          redirect_uri: cfg.redirectUri,
        }),
      });
      if (!res.ok) throw new Error(`github token exchange failed: ${res.status}`);
      const data = (await res.json()) as { access_token?: string; error?: string };
      if (!data.access_token) throw new Error(`github token exchange: ${data.error ?? "no access_token"}`);
      return data.access_token;
    },
    async fetchUser(accessToken: string): Promise<GithubUser> {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "sugo-dashboard",
        },
      });
      if (!res.ok) throw new Error(`github user fetch failed: ${res.status}`);
      const u = (await res.json()) as { id: number; login: string; name: string | null };
      return { id: u.id, login: u.login, name: u.name ?? null };
    },
  };
}
