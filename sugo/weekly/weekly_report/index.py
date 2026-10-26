"""index.html: every week from the first recorded one to the latest finished one, with a calendar and collect buttons.

The page is a static file. Sugo Console schedules generation and /sugo:weekly builds a week on demand, so the collect
buttons stay off and say where to generate.
"""

from __future__ import annotations

import html
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from . import collect as collect_mod

DAYS = "월화수목금토일"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def first_monday(cfg: dict, sugo_home: Path = collect_mod.SUGO_HOME) -> date:
    """config "start_week" (2026-W37), else the Monday of the oldest sugo workspace."""
    if cfg.get("start_week"):
        y, w = cfg["start_week"].upper().split("-W")
        return date.fromisocalendar(int(y), int(w), 1)
    days = []
    for f in (sugo_home / "work").glob("*/workspace.json"):
        created = (_read(f) or {}).get("created_at")
        if created:
            days.append(datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone(collect_mod.KST).date())
    d = min(days) if days else datetime.now(collect_mod.KST).date()
    return d - timedelta(days=d.weekday())


def week_list(cfg: dict, today: date | None = None, sugo_home: Path = collect_mod.SUGO_HOME) -> list[str]:
    """ISO week labels from the first recorded week to the latest finished week, newest first."""
    last = collect_mod.week_range(None, today)[1].date()
    out, d = [], first_monday(cfg, sugo_home)
    while d <= last:
        y, w, _ = d.isocalendar()
        out.append(f"{y}-W{w:02d}")
        d += timedelta(days=7)
    return out[::-1]


CSS = """
:root{--bg:#f4f5f7;--panel:#fff;--ink:#16191e;--muted:#5d6470;--line:#dde0e6;--soft:#eef0f3;--accent:#2a56c6;--accent-soft:#e7edfb;
--ok:#177a4b;--ok-soft:#e1f3ea;--warn:#9a5400;--warn-soft:#fdf1dc;--warn-line:#e9b45f;--f:"Apple SD Gothic Neo","IBM Plex Sans KR",system-ui,sans-serif;--m:ui-monospace,Menlo,monospace;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d1117;--panel:#151b23;--ink:#e6eaf0;--muted:#97a3b4;--line:#252d39;--soft:#1b222c;
--accent:#7ca3ff;--accent-soft:#17233f;--ok:#62d19a;--ok-soft:#14291d;--warn:#f2b35c;--warn-soft:#2e2310;--warn-line:#8a6420;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0d1117;--panel:#151b23;--ink:#e6eaf0;--muted:#97a3b4;--line:#252d39;--soft:#1b222c;--accent:#7ca3ff;--accent-soft:#17233f;
--ok:#62d19a;--ok-soft:#14291d;--warn:#f2b35c;--warn-soft:#2e2310;--warn-line:#8a6420;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 var(--f);-webkit-font-smoothing:antialiased}
.wrap{max-width:1360px;margin:0 auto;padding:26px clamp(14px,2vw,32px) 80px}h1{font-size:28px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;align-items:start}
.list{display:grid;gap:12px}
.card{display:flex;gap:18px;align-items:center;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:12px;padding:14px 18px;cursor:pointer;transition:border-color .12s,box-shadow .12s}
.card.has{border-left-color:var(--accent)}.card.missing{border-left-color:var(--warn-line);cursor:default}.card.empty{opacity:.6;cursor:default}
.card.hl,.card:hover{box-shadow:0 0 0 2px var(--accent)}.card.missing.hl,.card.missing:hover,.card.empty:hover{box-shadow:0 0 0 2px var(--line)}
.main{flex:1;min-width:0}.wk{font:700 19px var(--m)}.rng{color:var(--muted);font-size:15px;margin-left:10px}
.hd{margin-top:4px;font-size:15.5px;display:grid;gap:2px}.hd div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{color:var(--muted);font-size:14px;margin-top:4px}.side{flex:none;display:grid;gap:6px;justify-items:end;min-width:150px}
.st{font-size:13.5px;font-weight:700;padding:1px 10px;border-radius:999px;background:var(--soft);color:var(--muted)}
.st.fresh{background:var(--ok-soft);color:var(--ok)}.st.stale,.st.missing{background:var(--warn-soft);color:var(--warn)}
button.go{font:inherit;font-size:14.5px;font-weight:600;border-radius:8px;padding:4px 14px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff}
button.go.ghost{background:none;color:var(--muted);border-color:var(--line)}button.go:disabled{opacity:.55;cursor:default}
.msg{font-size:13px;color:var(--muted);max-width:220px;text-align:right}
.cal{position:sticky;top:20px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;max-height:calc(100vh - 40px);overflow:auto}
.calh{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}.calh b{font-size:16px}.calh button{font:inherit;font-size:20px;line-height:1;width:34px;height:30px;border-radius:8px;border:1px solid var(--line);background:none;color:var(--ink);cursor:pointer}.calh button:disabled{opacity:.3;cursor:default}.calh button:not(:disabled):hover{border-color:var(--accent);color:var(--accent)}.mon[hidden]{display:none}
.cal table{width:100%;border-collapse:separate;border-spacing:0 3px;font:13.5px var(--m)}.cal th{font:600 12.5px var(--f);color:var(--muted);text-align:center}
.cal td{text-align:center;padding:4px 0}.cal td.wl{text-align:left;padding-left:6px;color:var(--muted);font-size:12px}
.cal tr.w td{border-top:1px solid transparent;border-bottom:1px solid transparent}.cal tr.w td:first-child{border-radius:6px 0 0 6px}.cal tr.w td:last-child{border-radius:0 6px 6px 0}
.cal tr.has td{background:var(--accent-soft)}.cal tr.missing td{background:var(--warn-soft)}.cal tr[data-week]{cursor:pointer}
.cal tr.hl td{background:var(--accent);color:#fff}.cal td.out{opacity:.35}.cal td.we{color:var(--muted)}
.legend{display:flex;gap:12px;font-size:13px;color:var(--muted);margin-top:10px;flex-wrap:wrap}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.srv{font-size:13.5px;color:var(--muted);margin-top:10px}
@media (max-width:980px){.grid{grid-template-columns:1fr}.cal{position:static}}
"""

JS = r"""
const S=JSON.parse(document.getElementById('settings').textContent);
const cards=[...document.querySelectorAll('.card')], rows=[...document.querySelectorAll('.cal tr[data-week]')];
const mons=[...document.querySelectorAll('.cal .mon')], cm=document.getElementById('cm'), cprev=document.getElementById('cprev'), cnext=document.getElementById('cnext');
let mi=mons.length-1;
const showMonth=i=>{if(!mons.length) return; mi=Math.max(0,Math.min(mons.length-1,i)); mons.forEach((m,k)=>m.hidden=k!==mi);
  cm.textContent=mons[mi].dataset.title; cprev.disabled=mi===0; cnext.disabled=mi===mons.length-1;};
if(cprev){cprev.addEventListener('click',()=>showMonth(mi-1)); cnext.addEventListener('click',()=>showMonth(mi+1)); showMonth(mi);}
const byWeek=w=>({card:cards.find(c=>c.dataset.week===w), row:rows.find(r=>r.dataset.week===w)});
const hl=(w,on)=>{const {card}=byWeek(w); card&&card.classList.toggle('hl',on); rows.filter(r=>r.dataset.week===w).forEach(r=>r.classList.toggle('hl',on));
  if(on&&!rows.some(r=>r.dataset.week===w&&!r.closest('.mon').hidden)){const home=rows.find(r=>r.dataset.week===w&&r.dataset.home)||rows.find(r=>r.dataset.week===w); if(home) showMonth(mons.indexOf(home.closest('.mon')));}};
const open=w=>{const {card}=byWeek(w); if(card&&card.classList.contains('has')) location.href=w+'.html#report';};
cards.forEach(c=>{c.addEventListener('mouseenter',()=>hl(c.dataset.week,true));c.addEventListener('mouseleave',()=>hl(c.dataset.week,false));
  c.addEventListener('click',e=>{if(!e.target.closest('button')) open(c.dataset.week);});
  c.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.closest('button')) open(c.dataset.week);});});
rows.forEach(r=>{r.addEventListener('mouseenter',()=>{hl(r.dataset.week,true);const {card}=byWeek(r.dataset.week);card&&card.scrollIntoView({block:'nearest',behavior:'smooth'});});
  r.addEventListener('mouseleave',()=>hl(r.dataset.week,false)); r.addEventListener('click',()=>open(r.dataset.week));});
const srv=document.getElementById('srv');
const call=(path,opt={})=>fetch(S.url+path,{...opt,headers:{'X-Token':S.token,'Content-Type':'application/json'}}).then(r=>r.json().then(j=>({ok:r.ok,status:r.status,j})));
const setCard=(w,st)=>{const {card}=byWeek(w); if(!card) return; const b=card.querySelector('button.go'), s=card.querySelector('.st'), m=card.querySelector('.msg');
  if(!st.has_records&&!st.report){s.className='st';s.textContent='기록 없음';b.hidden=true;card.className='card empty';return;}
  if(!st.report){s.className='st missing';s.textContent='미생성';b.hidden=false;b.className='go';b.textContent='수집';b.dataset.force='';return;}
  s.className='st '+(st.fresh?'fresh':'stale'); s.textContent=st.fresh?'최신':'기록 변경됨';
  b.hidden=false; b.className='go'+(st.fresh?' ghost':''); b.textContent='다시 수집'; b.dataset.force='1';
  if(m&&!st.fresh) m.textContent='생성 뒤에 기록이 바뀌었다';};
let polling=null;
const showJob=j=>{if(!j||!j.week) return; const {card}=byWeek(j.week); if(!card) return; const b=card.querySelector('button.go'), m=card.querySelector('.msg');
  if(j.state==='running'){b.disabled=true;b.textContent='수집 중…';m.textContent=j.step||'';cards.forEach(c=>{const x=c.querySelector('button.go');if(x&&c!==card)x.disabled=true;});}
  else if(j.state==='done'){m.textContent='완료 — 다시 불러온다';setTimeout(()=>location.reload(),800);}
  else if(j.state==='failed'){b.disabled=false;b.textContent='다시 시도';m.textContent=j.error||'실패';}};
const poll=()=>call('/job').then(({j})=>{showJob(j); if(j&&j.state==='running'){polling=setTimeout(poll,3000);} else polling=null;}).catch(()=>{});
if(!S.token){srv.textContent='보고서 생성은 Sugo Console의 Weekly 예약 또는 /sugo:weekly로 한다.';document.querySelectorAll('button.go').forEach(b=>b.disabled=true);}
else{srv.textContent='최신 여부 확인 중…';
  call('/status').then(({j})=>{(j.weeks||[]).forEach(w=>setCard(w.week,w)); srv.textContent=''; showJob(j.job); if(j.job&&j.job.state==='running') poll();})
  .catch(()=>{srv.textContent='수집 서버에 연결할 수 없다. 보고서는 Sugo Console의 Weekly 예약 또는 /sugo:weekly로 만든다.';
    document.querySelectorAll('button.go').forEach(b=>b.disabled=true);});}
document.querySelectorAll('button.go').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation(); const w=b.closest('.card').dataset.week;
  b.disabled=true;b.textContent='시작 중…';
  call('/build',{method:'POST',body:JSON.stringify({week:w,force:!!b.dataset.force})}).then(({ok,j})=>{if(!ok){b.disabled=false;b.textContent='다시 시도';b.closest('.card').querySelector('.msg').textContent=j.error||'실패';return;} poll();})
  .catch(()=>{b.disabled=false;b.textContent='다시 시도';});}));
"""


def _e(s) -> str:
    return html.escape("" if s is None else str(s))


def _calendar(labels: list[str], status: dict[str, str]) -> str:
    """Full month grids from the first listed week to the latest one; only the latest month is shown at first.
    A week that spans two months appears in both; data-home marks the month of its Monday."""
    if not labels:
        return ""
    listed = set(labels)
    mondays = sorted(date.fromisocalendar(int(l[:4]), int(l[6:]), 1) for l in labels)
    first, last = mondays[0].replace(day=1), (mondays[-1] + timedelta(days=4)).replace(day=1)
    months, m = [], first
    while m <= last:
        months.append(m)
        m = (m.replace(day=28) + timedelta(days=4)).replace(day=1)
    out = []
    for mo in months:
        nxt = (mo.replace(day=28) + timedelta(days=4)).replace(day=1)
        rows, mon = [], mo - timedelta(days=mo.weekday())
        while mon < nxt:
            y2, w, _ = mon.isocalendar()
            label = f"{y2}-W{w:02d}"
            cells = "".join(f'<td class="{"out" if (mon + timedelta(days=i)).month != mo.month else ""}{" we" if i >= 5 else ""}">{(mon + timedelta(days=i)).day}</td>'
                            for i in range(7))
            attrs = f' data-week="{label}"' + (' data-home="1"' if mon.month == mo.month else "") if label in listed else ""
            rows.append(f'<tr class="w {status.get(label, "")}"{attrs}><td class="wl">W{w:02d}</td>{cells}</tr>')
            mon += timedelta(days=7)
        out.append(f'<div class="mon" data-month="{mo:%Y-%m}" data-title="{mo.year}년 {mo.month}월"{"" if mo == months[-1] else " hidden"}>'
                   f'<table><thead><tr><th></th>{"".join(f"<th>{d}</th>" for d in DAYS)}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>')
    return (f'<div class="calh"><button type="button" id="cprev" aria-label="이전 달">‹</button><b id="cm">{months[-1].year}년 {months[-1].month}월</b>'
            f'<button type="button" id="cnext" aria-label="다음 달">›</button></div>' + "".join(out))


def write_index(out: Path, cfg: dict | None = None, today: date | None = None) -> None:
    cfg = collect_mod.load_config() if cfg is None else cfg
    labels = week_list(cfg, today)
    cards, status = [], {}
    for label in labels:
        r, w = _read(out / f"{label}.report.json"), _read(out / f"{label}.week.json")
        _, start, end = collect_mod.week_range(label)
        rng = f"{start:%m/%d} ~ {(end - timedelta(days=1)):%m/%d}"
        if r:
            status[label] = "has"
            decisions = sum(1 for t in r.get("topics", []) for x in t.get("todo", []) if x.get("kind") == "결정 필요")
            meta = f'주제 {len(r.get("topics", []))} · 기술 {len((r.get("tech") or {}).get("items", []))}' + (f" · 결정 필요 {decisions}" if decisions else "") \
                + (f' · 생성 {_e(r["_generated_at"][5:16].replace("T", " "))}' if r.get("_generated_at") else "")
            body = f'<div class="hd">{"".join(f"<div>{_e(h)}</div>" for h in r.get("headline", []))}</div><div class="meta">{meta}</div>'
            side = '<span class="st">생성됨</span><button class="go ghost" data-force="1">다시 수집</button>'
            cls = "has"
        else:
            status[label] = "missing"
            body = '<div class="meta">보고서가 없다</div>'
            side = '<span class="st missing">미생성</span><button class="go">수집</button>'
            cls = "missing"
        cards.append(f'<div class="card {cls}" data-week="{label}" tabindex="0" role="link"><div class="main"><span class="wk">{label}</span><span class="rng">{rng}</span>{body}</div>'
                     f'<div class="side">{side}<span class="msg"></span></div></div>')
    # 수집은 Sugo Console(예약·Weekly 화면)과 /sugo:weekly가 맡는다. 이 정적 페이지에는 수집 버튼을 켜지 않는다.
    settings = {"url": "", "token": None, "user": Path.home().name}
    legend = ('<div class="legend"><span><i style="background:var(--accent-soft)"></i>생성됨</span><span><i style="background:var(--warn-soft)"></i>미생성</span>'
              '<span><i style="background:var(--accent)"></i>가리킨 주</span></div>')
    (out / "index.html").write_text(
        '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주간 작업 목록</title>'
        f'<style>{CSS}</style></head><body><div class="wrap"><h1>주간 작업</h1><div class="grid"><div class="list">{"".join(cards)}</div>'
        f'<aside class="cal">{_calendar(labels, status)}{legend}<div class="srv" id="srv"></div></aside></div></div>'
        f'<script type="application/json" id="settings">{json.dumps(settings).replace("</", "<\\/")}</script><script>{JS}</script></body></html>\n',
        encoding="utf-8")
