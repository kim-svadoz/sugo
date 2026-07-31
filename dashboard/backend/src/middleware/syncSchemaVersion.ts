import type { NextFunction, Request, Response } from "express";

/**
 * §3.1 "미들웨어가 payload `schemaVersion` 소비(`req.syncSchemaVersion`), 상위버전이면 로그만(500 금지)."
 *
 * 플러그인(§8.2)과 대시보드는 별개 배포라 어느 쪽이 먼저 올라갈지 모른다. 이 미들웨어의 계약은
 * **절대 요청을 막지 않는 것**이다 — 값이 없든, 쓰레기든, 우리보다 높든 전부 통과시킨다.
 * 막는 순간 "대시보드 배포가 플러그인 sync를 죽이는" 사고가 되고, sync는 fire-and-forget이라
 * 플러그인 쪽에선 조용한 유실로 보인다.
 *
 * 값 자체는 아직 아무 것도 분기시키지 않는다. `req.syncSchemaVersion`을 세워두는 이유는 나중에
 * 계약이 갈라졌을 때 핸들러가 버전별로 해석을 바꿀 **자리**를 미리 만들어 두기 위함이다.
 */
export const SYNC_SCHEMA_VERSION = 1;

export const SYNC_SCHEMA_VERSION_HEADER = "X-Sugo-Sync-Schema-Version";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      syncSchemaVersion?: number;
    }
  }
}

export function syncSchemaVersion() {
  // 상위버전 경고는 프로세스당 버전별 1회만 — 플러그인이 매 이벤트마다 보내므로 그냥 찍으면
  // 로그가 이 한 줄로 도배된다.
  const warned = new Set<number>();

  return function syncSchemaVersionMiddleware(req: Request, res: Response, next: NextFunction): void {
    res.setHeader(SYNC_SCHEMA_VERSION_HEADER, String(SYNC_SCHEMA_VERSION));

    const body = req.body as { schemaVersion?: unknown } | undefined;
    const raw = body && typeof body === "object" ? body.schemaVersion : undefined;
    // 양의 정수만 인정. 문자열 "1"조차 받지 않는다 — 계약 위반을 조용히 관용하면 어느 쪽이
    // 잘못 보내고 있는지 영영 모른다(통과는 시키되 값은 안 세운다).
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
      req.syncSchemaVersion = raw;
      if (raw > SYNC_SCHEMA_VERSION && !warned.has(raw)) {
        warned.add(raw);
        console.warn(
          `[sync] 플러그인 sync 계약이 더 최신입니다(plugin=${raw}, server=${SYNC_SCHEMA_VERSION}). ` +
            "모르는 필드는 무시하고 계속 처리합니다 — 대시보드 업데이트를 권장합니다.",
        );
      }
    }

    next();
  };
}
