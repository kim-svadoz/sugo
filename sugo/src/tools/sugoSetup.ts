import { z } from "zod";

export const sugoSetupInputSchema = {
  bitbucket: z
    .object({ baseUrl: z.string().optional(), projectKey: z.string().optional() })
    .optional()
    .describe("Bitbucket 연동 설정. 토큰 자체는 대시보드가 암호화 보관한다"),
  jira: z
    .object({ baseUrl: z.string().optional(), projectKey: z.string().optional() })
    .optional()
    .describe("Jira 연동 설정. 이 빌드는 저장하지 않고 받은 값을 되돌려준다"),
  initSecrets: z.boolean().optional().describe("시크릿 저장소 초기화 여부"),
};

const SugoSetupArgs = z.object(sugoSetupInputSchema);

/**
 * `sugo_setup` — 연동(Bitbucket/Jira) 설정.
 *
 * **설정을 받아 저장하지 않는다.** 연동은 플러그인 범위 밖이고,
 * **토큰은 대시보드가 AES-256-GCM으로 보관하는 게 정본 경로**라 플러그인에 별도
 * 저장소를 만드는 건 시크릿을 한 군데 더 흩뿌리는 일이 된다.
 *
 * 그래서 받은 값을 그대로 되돌려주며 **어디서 설정해야 하는지**만 알린다 — 설정한 척하고
 * 아무 데도 안 쓰는 것보다 낫다.
 */
export async function handleSugoSetup(rawArgs: unknown) {
  const args = SugoSetupArgs.parse(rawArgs ?? {});
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            configured: false,
            received: args,
            note:
              "플러그인은 연동 설정을 저장하지 않습니다. Bitbucket PAT는 대시보드 Settings에서 등록하세요(암호화 보관). " +
              "Jira 연동 설정도 이 빌드에서는 저장하지 않습니다.",
          },
          null,
          2,
        ),
      },
    ],
  };
}
