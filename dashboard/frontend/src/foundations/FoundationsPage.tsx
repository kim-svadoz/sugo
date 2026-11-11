import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { COLOR_TOKENS, CONTROL_TOKENS, RADIUS_TOKENS, SPACING_TOKENS } from "../design/tokens.js";
import { TYPOGRAPHY_ROLES } from "../design/typography.js";
import { Badge, Button, Modal, SelectField, Surface, TextAreaField, TextField } from "../shared/ui/index.js";

const cssValue = (name: string) => typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function FoundationsPage() {
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  return <main className="fd-page">
    <header className="fd-header">
      <div><div className="text-caption-role text-role--brand text-role--mono">SUGO CONSOLE</div><h1 className="text-display-role">Foundations</h1></div>
      <p className="text-body-role text-role--muted">현재 Console의 시각 언어를 값 → 역할 → 컴포넌트로 정규화한 내부 기준표다.</p>
    </header>

    <Section title="Principles">
      <ol className="fd-rules text-body-role">
        <li>값의 정본은 <code>styles/tokens.css</code> 하나다.</li>
        <li>화면은 색·크기 값 대신 역할 토큰과 <code>shared/ui</code> 컴포넌트를 쓴다.</li>
        <li>기존 Sugo 화면의 계산값과 비율은 디자인 시스템보다 우선한다.</li>
        <li>변경 전후 route·overlay·component snapshots이 같아야 한다.</li>
      </ol>
    </Section>

    <Section title="Typography">
      <div className="fd-table">
        {TYPOGRAPHY_ROLES.map(({ role, className, usage }) => <div className="fd-type-row" key={role}>
          <code>{role}</code><span className={className}>Sugo 개발 워크플로우</span><span className="text-caption-role">{usage}</span>
        </div>)}
      </div>
    </Section>

    <Section title="Color">
      {COLOR_TOKENS.map(group => <div key={group.group} className="fd-token-group"><h3 className="text-label-role">{group.group}</h3><div className="fd-swatches">
        {group.names.map(name => <div className="fd-swatch" key={name}><span style={{ background: `var(${name})` }} /><code>{name}</code><small>{cssValue(name)}</small></div>)}
      </div></div>)}
    </Section>

    <Section title="Shape and scale">
      <TokenLine title="Spacing" names={SPACING_TOKENS} kind="space" />
      <TokenLine title="Radius" names={RADIUS_TOKENS} kind="radius" />
      <TokenLine title="Control height" names={CONTROL_TOKENS} kind="height" />
    </Section>

    <Section title="Buttons">
      <div className="fd-state-grid">
        <Demo label="role × emphasis"><Button role="brand" emphasis="solid" leadingIcon={<Plus size={16} />}>주요 작업</Button><Button role="neutral" emphasis="soft">보조 작업</Button><Button role="danger" emphasis="ghost" leadingIcon={<Trash2 size={16} />}>삭제</Button></Demo>
        <Demo label="size"><Button size="medium">Medium</Button><Button size="small">Small</Button><Button size="xsmall">Xsmall</Button></Demo>
        <Demo label="state"><Button role="brand" loading>저장 중</Button><Button disabled>비활성</Button><Button role="brand" emphasis="ghost" trailingIcon={<Check size={16} />}>완료</Button></Demo>
      </div>
    </Section>

    <Section title="Badges and surfaces">
      <div className="fd-inline">{(["neutral", "brand", "success", "progress", "warning", "danger"] as const).map(tone => <Badge tone={tone} key={tone}>{tone}</Badge>)}</div>
      <div className="fd-surface-grid"><Surface level="panel">Panel</Surface><Surface level="raised">Raised</Surface><Surface level="inset">Inset</Surface></div>
    </Section>

    <Section title="Fields and dropdowns">
      <div className="fd-form-grid">
        <TextField label="프로젝트 이름" defaultValue="sample-api" hint="워크스페이스에 표시되는 이름" />
        <SelectField label="기본 브랜치" defaultValue="main"><option value="main">main</option><option value="develop">develop</option></SelectField>
        <TextField label="실패 상태" defaultValue="잘못된 값" error="유효한 경로를 입력해 주세요." />
        <TextField label="비활성" defaultValue="수정할 수 없음" disabled />
        <TextAreaField label="설명" defaultValue="완료 조건과 검증 근거를 적습니다." />
      </div>
    </Section>

    <Section title="Overlays">
      <div className="fd-inline"><Button role="brand" onClick={() => setDialog(true)}>모달 열기</Button><div className="fd-menu-wrap"><Button onClick={() => setMenu(v => !v)} trailingIcon={<ChevronDown size={15} />} aria-expanded={menu}>드롭다운</Button>{menu && <div className="fd-menu" role="menu"><button role="menuitem">최근 작업</button><button role="menuitem">보관함</button><button role="menuitem">설정</button></div>}</div></div>
      {dialog && <Modal onClose={() => setDialog(false)}><h2 className="text-title-role">검토 요청</h2><p className="text-body-role text-role--muted fd-dialog-copy">현재 비율과 구성은 기존 Console Modal을 그대로 사용한다.</p><div className="fd-dialog-actions"><Button onClick={() => setDialog(false)}>취소</Button><Button role="brand" emphasis="solid" onClick={() => setDialog(false)}>확인</Button></div></Modal>}
    </Section>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="fd-section"><h2 className="text-title-role">{title}</h2>{children}</section>;
}

function Demo({ label, children }: { label: string; children: React.ReactNode }) {
  return <Surface className="fd-demo"><div className="text-caption-role text-role--mono">{label}</div><div className="fd-inline">{children}</div></Surface>;
}

function TokenLine({ title, names, kind }: { title: string; names: readonly string[]; kind: "space" | "radius" | "height" }) {
  return <div className="fd-token-group"><h3 className="text-label-role">{title}</h3><div className="fd-scale-row">{names.map(name => <div key={name}><span className={`fd-scale-sample fd-scale-sample--${kind}`} style={kind === "space" ? { width: `var(${name})` } : kind === "height" ? { height: `var(${name})` } : { borderRadius: `var(${name})` }} /><code>{name}</code><small>{cssValue(name)}</small></div>)}</div></div>;
}
