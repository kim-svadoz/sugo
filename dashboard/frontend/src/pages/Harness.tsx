import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { getHarnessManifest, getHarnessUnified, type HarnessManifestEntry } from "../api/catalogApi.js";

// §5 Harness — unified 마크다운 렌더 + manifest 칩. 데이터는 백엔드 /api/harness(HARNESS_PATH).
export function Harness() {
  const [md, setMd] = useState("");
  const [manifest, setManifest] = useState<HarnessManifestEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getHarnessUnified().catch(() => ""), getHarnessManifest().catch(() => [])])
      .then(([m, mf]) => {
        setMd(m);
        setManifest(mf);
      })
      .finally(() => setLoaded(true));
  }, []);

  const html = useMemo(() => (md ? (marked.parse(md, { async: false }) as string) : ""), [md]);
  const empty = loaded && !md && manifest.length === 0;

  return (
    <div className="space-y-6">
      {/* 설계안 Harness 헤더 — 제목 + 부제. */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-bright)]">Harness</h1>
        <p className="text-[var(--color-text-muted)]">통합 코딩 하네스</p>
      </div>

      {manifest.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {manifest.map((h, i) => (
            <span key={h.id ?? i} className="ck-pill" style={{ color: "#fbbf24", borderColor: "rgba(245,158,11,0.4)" }}>
              {h.name ?? h.id ?? "harness"}{h.version ? ` · ${h.version}` : ""}
            </span>
          ))}
        </div>
      )}

      {empty ? (
        <div className="ck-glass ck-card ck-scan space-y-2 text-sm text-slate-300">
          <div className="font-mono text-slate-100">하네스가 설정되지 않았습니다.</div>
          <p className="text-slate-400">
            백엔드 <code style={{ color: "var(--color-primary)" }}>HARNESS_PATH</code>를 플러그인의 <code>sugo/harness-library</code>(또는 빌드된 하네스 디렉터리)로
            지정하면 통합 하네스 문서가 여기에 렌더됩니다. (로컬 dev면 backend/.env에 <code>HARNESS_PATH=...</code>)
          </p>
        </div>
      ) : (
        html && (
          // 설계안: 뷰포트를 채우는 단일 스크롤 패널(문서가 길어도 페이지가 아니라 패널이 스크롤).
          <div className="ck-scroll h-[calc(100vh-200px)] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
            <article className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )
      )}
    </div>
  );
}
