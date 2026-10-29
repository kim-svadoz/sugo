import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** Preferences › 외부 연동에서 꺼 둔 기능의 탭 본문. 네 탭이 같은 형식을 쓴다. */
export function IntegrationFeatureOffNotice({ label }: { label: string }) {
  const navigate = useNavigate();
  return <div className="grid min-h-[380px] place-items-center px-6 py-12">
    <div className="max-w-md text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center border border-amber-300/50 text-lg font-bold text-amber-200" aria-hidden="true">!</div>
      <h2 className="mt-5 text-[17px] font-semibold text-white">{label} 연동이 꺼져 있습니다</h2>
      <p className="mt-2 text-[13px] leading-6 text-slate-400">Preferences › 외부 연동에서 켜면 여기서 설정할 수 있습니다.</p>
      <button type="button" onClick={() => navigate("/preferences?tab=integrations")} className="settings-action settings-action-primary mt-6 gap-1.5">외부 연동 설정 열기<ArrowRight size={13} /></button>
    </div>
  </div>;
}
