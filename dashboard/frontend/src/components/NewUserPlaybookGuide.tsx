import { useEffect, useState } from "react";

interface GuidePath {
  width: number;
  height: number;
  path: string;
}

export function NewUserPlaybookGuide({ visible }: { visible: boolean }) {
  const [guide, setGuide] = useState<GuidePath | null>(null);

  useEffect(() => {
    if (!visible) {
      setGuide(null);
      return;
    }
    const update = () => {
      const target = document.querySelector<HTMLElement>("[data-playbook-guide-target]");
      const origin = document.querySelector<HTMLElement>("[data-playbook-guide-origin]");
      if (!target || !origin || window.innerWidth < 768) {
        setGuide(null);
        return;
      }
      const targetRect = target.getBoundingClientRect();
      const originRect = origin.getBoundingClientRect();
      const startX = originRect.left + 6;
      const startY = originRect.top + originRect.height / 2;
      const endX = targetRect.right - 7;
      const endY = targetRect.top + targetRect.height / 2;
      const bendX = Math.max(endX + 44, startX - Math.min(180, (startX - endX) * 0.42));
      setGuide({
        width: window.innerWidth,
        height: window.innerHeight,
        path: `M ${startX} ${startY} C ${bendX} ${startY}, ${bendX} ${endY}, ${endX} ${endY}`,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [visible]);

  if (!guide) return null;
  return <svg aria-hidden="true" className="pointer-events-none fixed inset-0 z-40" width={guide.width} height={guide.height} viewBox={`0 0 ${guide.width} ${guide.height}`}>
    <defs>
      <linearGradient id="playbook-guide-gradient" x1="1" x2="0">
        <stop offset="0" stopColor="#67e8f9" stopOpacity=".92" />
        <stop offset="1" stopColor="#c4b5fd" stopOpacity=".62" />
      </linearGradient>
      <marker id="playbook-guide-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M 0 0 L 8 4 L 0 8 Z" fill="#67e8f9" />
      </marker>
    </defs>
    <path d={guide.path} fill="none" stroke="url(#playbook-guide-gradient)" strokeWidth="2" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#playbook-guide-arrow)" className="animate-[playbookGuideFlow_1.6s_linear_infinite] drop-shadow-[0_0_5px_rgba(103,232,249,.45)]" />
  </svg>;
}
