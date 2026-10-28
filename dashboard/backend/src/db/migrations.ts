import type { DbClient } from "./client.js";

/**
 * 스키마 파일(`CREATE TABLE IF NOT EXISTS`)이 못 하는 일 = **이미 존재하는 테이블의 변형**.
 * 여기 있는 함수들은 부팅 때 매번 돌고, 반드시 (a) 멱등이고 (b) 실패해도 부팅을 안 막는다.
 * `ensureWorkspaceDeletedAtColumn`과 같은 자가보강 패턴 — "코드가 마이그레이션보다
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
 * `canvas` 이름을 쓰던 이전 DB를 `roadmap`으로 바꾼다.
 * 스키마 파일은 새 이름으로 `CREATE TABLE IF NOT EXISTS`를 돌리므로, 이 마이그레이션이
 * 없으면 이미 만들어진 DB는 **빈 `sugo_roadmap_nodes`가 생기고 노드 데이터는 `sugo_canvas_nodes`에 남아
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
          "어느 쪽이 정본인지 확인 후 이전 이름의 테이블을 수동으로 정리하세요.",
      );
      return;
    }

    await db.exec("ALTER TABLE sugo_canvas_nodes RENAME TO sugo_roadmap_nodes");
    console.info("[migration] sugo_canvas_nodes → sugo_roadmap_nodes 리네임 완료.");
  } catch (err) {
    // ALTER 권한이 없는 배포도 있다. 여기서 던지면 대시보드가 아예 안 뜬다 — 로그만 남기고 계속.
    console.warn(`[migration] canvas→roadmap 리네임 실패(계속 진행): ${(err as Error).message}`);
  }
}

/** ADR 뷰를 제거하면서 SPEC 원문 저장소만 의미가 분명한 이름으로 보존한다. */
export async function migrateDecisionsToSpecs(db: DbClient): Promise<void> {
  try {
    if (!(await tableExists(db, "sugo_decisions")) || await tableExists(db, "sugo_specs")) return;
    await db.exec("ALTER TABLE sugo_decisions RENAME TO sugo_specs");
    console.info("[migration] sugo_decisions → sugo_specs 리네임 완료.");
  } catch (err) {
    console.warn(`[migration] decisions→specs 리네임 실패(계속 진행): ${(err as Error).message}`);
  }
}

/**
 * Ontology snapshot 컬럼의 부팅 마이그레이션. sync 요청에서만 자가보강하면 그보다 먼저 실행되는
 * Workspace/Schedule 읽기가 컬럼 없는 DB에서 `no such column`로 죽는다. 읽기 전에 항상 실행하고,
 * CREATE TABLE IF NOT EXISTS가 이미 컬럼을 만든 신규 DB에서는 no-op이다.
 */
export async function migrateRoadmapRuntimeAssessment(db: DbClient): Promise<boolean> {
  try {
    await db.query("SELECT runtime_assessment FROM sugo_roadmap_nodes LIMIT 1");
    return true;
  } catch {
    // 컬럼이 없다.
  }
  try {
    // SQLite는 JSON을 type affinity로 허용하고 MySQL은 실제 JSON 검증을 적용한다. 신규 스키마와
    // 같은 선언을 써서 업그레이드 DB만 TEXT로 갈라지는 계약 drift를 막는다.
    await db.exec("ALTER TABLE sugo_roadmap_nodes ADD COLUMN runtime_assessment JSON NULL");
    return true;
  } catch (err) {
    console.warn(`[migration] runtime_assessment 추가 실패(계속 진행): ${(err as Error).message}`);
    return false;
  }
}

export async function ensureAwsContextDisplayOrderColumn(db: DbClient): Promise<void> {
  try {
    await db.query("SELECT display_order FROM user_aws_context_accounts LIMIT 1");
    return;
  } catch {
    // Existing installations need the additive column before AWS settings are read.
  }
  try {
    await db.exec("ALTER TABLE user_aws_context_accounts ADD COLUMN display_order INT NOT NULL DEFAULT 0");
  } catch (err) {
    console.warn(`[migration] AWS 환경 순서 컬럼 추가 실패(계속 진행): ${(err as Error).message}`);
  }
}
