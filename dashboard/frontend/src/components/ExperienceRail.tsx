import { ArrowRight, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { dashboardScene } from "../lib/experienceJourney.js";

export function ExperienceRail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scene = dashboardScene(pathname);

  return <aside className="experience-rail" aria-label="현재 Sugo 작업 맥락">
    <span className="experience-rail__pulse" aria-hidden="true"><Sparkles size={12} /></span>
    <span className="experience-rail__stage">{scene.stage}</span>
    <span className="experience-rail__context">{scene.context}</span>
    <span className="experience-rail__value"><span>얻는 효과</span>{scene.value}</span>
    <button type="button" onClick={() => navigate(scene.action.path)} className="experience-rail__action">{scene.action.label}<ArrowRight size={12} /></button>
  </aside>;
}
