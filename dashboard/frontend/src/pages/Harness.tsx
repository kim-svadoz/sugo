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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold ck-text-glow" style={{ color: "var(--color-primary)" }}>Harness</h1>
        <span className="ck-pill text-slate-400">{manifest.length} entries</span>
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
        html && <div className="ck-glass ck-card md-body" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
