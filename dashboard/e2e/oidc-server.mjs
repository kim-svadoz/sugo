// 실제 OIDC provider(oidc-provider) — dashboard의 createRemoteJWKSet(실 JWKS fetch) +
// createHttpOidcTokenClient(실 token 교환)을 진짜 OIDC 서버로 검증하기 위한 로컬 IdP.
// devInteractions(내장 로그인/동의 화면)를 켜서 헤드리스 브라우저가 실제 authorization_code
// 플로우를 완주할 수 있게 한다.
import Provider from "oidc-provider";
import { E2E_OIDC_URL, E2E_UI_URL, PORTS } from "../port-contract.mjs";

const ISSUER = E2E_OIDC_URL;
const PORT = PORTS.e2eOidc;
const REDIRECT = `${E2E_UI_URL}/auth/callback`;

const configuration = {
  clients: [
    {
      client_id: "sugo-dashboard",
      client_secret: "e2e-test-secret",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    },
  ],
  features: {
    devInteractions: { enabled: true }, // 내장 로그인/동의 화면(username=계정id, password 아무거나)
    resourceIndicators: { enabled: false },
  },
  scopes: ["openid", "profile", "email", "offline_access"],
  claims: {
    openid: ["sub"],
    profile: ["name", "preferred_username"],
    email: ["email"],
  },
  pkce: { required: () => false },
  async findAccount(_ctx, id) {
    return {
      accountId: id,
      async claims() {
        return { sub: id, name: "E2E 테스트 사용자", preferred_username: id, email: `${id}@e2e.local` };
      },
    };
  },
  ttl: {
    AccessToken: 3600,
    IdToken: 3600,
    RefreshToken: 86400,
    Session: 86400,
    Interaction: 3600,
    Grant: 86400,
  },
  cookies: { keys: ["e2e-cookie-key"] },
};

const oidc = new Provider(ISSUER, configuration);
oidc.proxy = true;

oidc.listen(PORT, "127.0.0.1", () => {
  console.log(`[oidc] real OIDC provider on ${ISSUER} (well-known: ${ISSUER}/.well-known/openid-configuration)`);
});
