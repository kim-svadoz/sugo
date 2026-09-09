export type DetectionCategory = "language" | "framework" | "dataStore" | "buildTool" | "infra";

export interface DetectedItem {
  id: string;
  category: DetectionCategory;
  name: string;
  version?: string;
  detectedBy: string;
}

export interface DetectedStack {
  languages: DetectedItem[];
  frameworks: DetectedItem[];
  dataStores: DetectedItem[];
  buildTools: DetectedItem[];
  infra: DetectedItem[];
  /** language/framework/buildTool 규칙의 id만 모음(중복제거). dataStore/infra는 정보성이라 제외한다(§2). */
  harnessIds: string[];
  commands: {
    build?: string;
    test?: string;
    format?: string;
    lint?: string;
  };
}

/**
 * fs 접근을 추상화 — 실제 프로젝트 디렉터리든 테스트 tmpdir 픽스처든 동일한 인터페이스로 규칙이 동작.
 */
export interface DetectionContext {
  projectPath: string;
  fileExists(relPath: string): boolean;
  readFile(relPath: string): string | null;
  readJson<T = unknown>(relPath: string): T | null;
}

export interface DetectionRule {
  id: string;
  category: DetectionCategory;
  /** 규칙 하나가 여러 항목을 낼 수도 있음(예: package.json에서 여러 프레임워크 검출) — 없으면 null */
  detect(ctx: DetectionContext): DetectedItem | DetectedItem[] | null;
}

/** HarnessFetcher/Composer가 다루는 하네스 콘텐츠(로컬 라이브러리 또는 fetch 결과) */
export interface HarnessContent {
  id: string;
  version: string;
  harnessMd: string;
  validationYaml: string;
  /** fetch 시점 실제 소스 — 로컬 라이브러리 사용, 요청 id 미보유로 default 대체, 등 */
  source: "local" | "default-fallback";
}
