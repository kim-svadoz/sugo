import type { DbClient } from "./client.js";

/**
 * 스키마 파일(`CREATE TABLE IF NOT EXISTS`)이 못 하는 일 = **이미 존재하는 테이블의 변형**.
 * 여기 있는 함수들은 부팅 때 매번 돌고, 반드시 (a) 멱등이고 (b) 실패해도 부팅을 안 막는다.
 * 스펙 §4 `ensureWorkspaceDeletedAtColumn`과 같은 자가보강 패턴 — "코드가 마이그레이션보다
 * 먼저 배포돼도 라이브가 안 깨지게" 한다.
 */

async function tableExists(db: DbClient, name: string): Promise<boolean> {
  // information_schema는 MySQL/SQLite 양쪽에 없으므로(SQLite는 sqlite_master) 드라이버 중립적으로
  // "읽어보고 터지면 없는 것"으로 판정한다. 존재하지만 권한이 없는 경우도 없는 것으로 보는데,
  // 그 경우 어차피 ALTER도 못 하므로 결론은 같다(아무 것도 안 함).
  try {
    await db.query(`SELECT 1 FROM ${name} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 한동안 대시보드에만 `canvas` 이름을 썼던 DB를 스펙대로 `roadmap`으로 되돌린다.
 * 스키마 파일은 새 이름으로 `CREATE TABLE IF NOT EXISTS`를 돌리므로, 이 마이그레이션이
 * 없으면 기존 DB는 **빈 `sugo_roadmap_nodes`가 생기고 노드 데이터는 `sugo_canvas_nodes`에 남아
 * 고아가 된다**(화면엔 "노드 없음"으로 보이고 원인은 안 보임). 그래서 스키마 적용 **전에** 돈다.
 *
 * 둘 다 있으면 손대지 않는다 — 어느 쪽이 정본인지 코드가 알 수 없고, 잘못 고르면 조용한 유실이다.
 */
export async function migrateCanvasToRoadmap(db: DbClient): Promise<void> {
  try {
    const hasOld = await tableExists(db, "sugo_canvas_nodes");
    if (!hasOld) return;

    const hasNew = await tableExists(db, "sugo_roadmap_nodes");
    if (hasNew) {
      console.warn(
        "[migration] sugo_canvas_nodes와 sugo_roadmap_nodes가 모두 존재합니다 — 자동 병합은 하지 않습니다. " +
          "어느 쪽이 정본인지 확인 후 구 테이블을 수동으로 정리하세요.",
      );
      return;
    }

    await db.exec("ALTER TABLE sugo_canvas_nodes RENAME TO sugo_roadmap_nodes");
    console.info("[migration] sugo_canvas_nodes → sugo_roadmap_nodes 리네임 완료(D1).");
  } catch (err) {
    // ALTER 권한이 없는 배포도 있다. 여기서 던지면 대시보드가 아예 안 뜬다 — 로그만 남기고 계속.
    console.warn(`[migration] canvas→roadmap 리네임 실패(계속 진행): ${(err as Error).message}`);
  }
}
