"""report.json + week.json -> one self-contained HTML file (no network)."""

from __future__ import annotations

import html
from collections import defaultdict
from datetime import date

DAYS = "월화수목금토일"

CSS = """
:root{--bg:#f4f5f7;--panel:#fff;--ink:#16191e;--muted:#5d6470;--line:#dde0e6;--soft:#eef0f3;--accent:#2a56c6;--accent-soft:#e7edfb;
--ok:#177a4b;--ok-soft:#e1f3ea;--warn:#9a5400;--warn-soft:#fdf1dc;--warn-line:#e9b45f;--bad:#b42318;--bad-soft:#fde7e4;
--f:"Apple SD Gothic Neo","IBM Plex Sans KR",system-ui,sans-serif;--m:ui-monospace,Menlo,monospace;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d1117;--panel:#151b23;--ink:#e6eaf0;--muted:#97a3b4;--line:#252d39;--soft:#1b222c;
--accent:#7ca3ff;--accent-soft:#17233f;--ok:#62d19a;--ok-soft:#14291d;--warn:#f2b35c;--warn-soft:#2e2310;--warn-line:#8a6420;--bad:#ff8b7e;--bad-soft:#3a1c18;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0d1117;--panel:#151b23;--ink:#e6eaf0;--muted:#97a3b4;--line:#252d39;--soft:#1b222c;--accent:#7ca3ff;--accent-soft:#17233f;
--ok:#62d19a;--ok-soft:#14291d;--warn:#f2b35c;--warn-soft:#2e2310;--warn-line:#8a6420;--bad:#ff8b7e;--bad-soft:#3a1c18;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 var(--f);-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:22px clamp(14px,2vw,32px) 80px}
h1{font-size:28px;margin:0}h2{font-size:21px;margin:0 0 12px}h3{margin:0;font-size:19px}h4{margin:0 0 4px;font-size:15px;color:var(--muted)}
code,.mono{font-family:var(--m);font-size:14.5px}code{background:var(--soft);padding:1px 6px;border-radius:5px}
a{color:var(--accent)}.back{font-size:15px;text-decoration:none;color:var(--muted)}.back:hover{color:var(--accent)}
.top{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-top:6px}.top .range{color:var(--muted);font-size:16px}
.tabs{display:flex;gap:8px;margin:18px 0 0;border-bottom:1px solid var(--line)}.tabs a{padding:10px 22px;font-weight:700;font-size:17px;color:var(--muted);text-decoration:none;border-bottom:3px solid transparent;margin-bottom:-1px}
.tabs a[aria-current="page"]{color:var(--accent);border-bottom-color:var(--accent)}.view[hidden]{display:none}
.sub{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;gap:4px 6px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line);margin-top:14px}
.sub a{font-size:15px;color:var(--muted);text-decoration:none;padding:3px 12px;border-radius:999px}.sub a:hover{color:var(--accent)}.sub a.on{background:var(--accent-soft);color:var(--accent);font-weight:700}
.sub button{font:inherit;font-size:15px;color:var(--muted);background:none;border:0;cursor:pointer;padding:3px 12px;border-radius:999px}.sub button:hover{color:var(--accent)}
.sub button.on{background:var(--accent-soft);color:var(--accent);font-weight:700}.sub button .n{font-family:var(--m);font-size:13px;margin-left:5px}.tc[hidden]{display:none}
.sub a .n{font-family:var(--m);font-size:13px;margin-left:5px}
section.s{margin-top:30px;scroll-margin-top:64px}
.head{list-style:none;margin:18px 0 0;padding:16px 20px;border-radius:14px;background:var(--panel);border:1px solid var(--line);display:grid;gap:6px}
.head li{font-size:18px}.head li::before{content:"■";color:var(--accent);font-size:11px;margin-right:12px;vertical-align:3px}
.cards{display:grid;gap:14px}.tp,.tc{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 20px;display:grid;gap:10px;scroll-margin-top:64px}
.tp{border-left:5px solid var(--accent)}.tp.unsup{border-left-color:var(--warn)}
.tph{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.tph .cp{margin-left:auto}
.pill{display:inline-block;font-size:13.5px;font-weight:600;padding:1px 10px;border-radius:999px;background:var(--soft);color:var(--muted);text-decoration:none}
.pill.cat{background:var(--accent-soft);color:var(--accent)}.pill.warn{background:var(--warn-soft);color:var(--warn)}.pill.dec{background:var(--bad-soft);color:var(--bad)}
.ol{font-size:18px;font-weight:600}dl{display:grid;grid-template-columns:76px 1fr;gap:8px 14px;margin:0}dt{color:var(--muted);font-size:15px;padding-top:1px}dd{margin:0;min-width:0}
ul.b{margin:0;padding-left:18px}ul.b li{margin:2px 0}
.todo{background:var(--warn-soft);border:1px solid var(--warn-line);border-radius:10px;padding:8px 14px}
.todo ul{margin:0;padding:0;display:grid;gap:6px}.todo li{list-style:none;display:flex;gap:10px;align-items:baseline}
.k{flex:none;font-size:13px;font-weight:700;padding:1px 9px;border-radius:999px;background:var(--panel);color:var(--warn);border:1px solid var(--warn-line)}
.k.k-결정{background:var(--bad);color:#fff;border-color:var(--bad)}
.ev{display:flex;flex-wrap:wrap;gap:6px}.ev span{font:13.5px var(--m);padding:1px 8px;border:1px solid var(--line);border-radius:6px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips a,.chips span{font-size:14px;padding:1px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent);text-decoration:none}
button.cp{font:inherit;font-size:14px;color:var(--muted);background:none;border:1px solid var(--line);border-radius:8px;padding:2px 12px;cursor:pointer}button.cp:hover{color:var(--accent);border-color:var(--accent)}
.list{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 20px 12px 38px;margin:0}.list li{margin:4px 0}
.list.blk{border-color:var(--warn-line);background:var(--warn-soft)}
.st{font-size:13.5px;font-weight:700;padding:1px 10px;border-radius:999px;margin-right:8px}.st-완료{background:var(--ok-soft);color:var(--ok)}.st-진행{background:var(--accent-soft);color:var(--accent)}
.st-미착수,.st-판단{background:var(--warn-soft);color:var(--warn)}
details.days{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 18px}details.days>summary{cursor:pointer;font-weight:600}
.day{margin:12px 0 4px;font-weight:700}.it{display:flex;gap:12px;font-size:15.5px;padding:3px 0}.it .ws{color:var(--muted);min-width:130px}
.learn{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin-top:18px}
.learn h2{font-size:17px;color:var(--muted);margin-bottom:6px}.toc{display:grid;gap:8px;margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.toc div{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.toc b{font-size:14px;color:var(--muted);min-width:150px}
.lv{font-size:12.5px;font-weight:700;padding:0 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.def{font-size:18px;font-weight:600;padding:10px 14px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.box{border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.box.ex{background:var(--soft)}.box.pit{background:var(--warn-soft);border-color:var(--warn-line)}
table.alt{width:100%;border-collapse:collapse;font-size:15.5px}table.alt th,table.alt td{text-align:left;vertical-align:top;padding:7px 10px;border-bottom:1px solid var(--line)}
table.alt th{font-size:14px;color:var(--muted);font-weight:600;background:var(--soft)}table.alt td:first-child{font-weight:700;white-space:nowrap}
.gen{color:var(--muted);margin-top:4px}.gen b{font-weight:700;font-size:13.5px;margin-right:8px;padding:0 8px;border-radius:999px;border:1px solid var(--line)}
details.q{border:1px solid var(--line);border-radius:10px;padding:8px 14px;margin-bottom:6px}details.q>summary{cursor:pointer;font-weight:600}details.q[open]>summary{margin-bottom:6px}
@media (max-width:860px){dl{grid-template-columns:1fr}.two{grid-template-columns:1fr}.it{flex-wrap:wrap}.it .ws{min-width:0}.toc b{min-width:0}}
"""

JS = """
const vs={report:document.getElementById('v-report'),tech:document.getElementById('v-tech')};
const show=()=>{const h=decodeURIComponent(location.hash.slice(1)), el=h&&document.getElementById(h); const k=h==='tech'||(el&&vs.tech.contains(el))?'tech':'report';
  for(const [n,v] of Object.entries(vs)){v.hidden=n!==k;document.querySelector(`.tabs a[href="#${n}"]`).setAttribute('aria-current',n===k?'page':'false');}
  const d=el&&el.querySelector&&el.querySelector('details.days'); if(d) d.open=true;
  if(el&&!['report','tech'].includes(h)) el.scrollIntoView();};
addEventListener('hashchange',show); show();
// 소분류 목차: 화면 위쪽에 걸친 섹션의 링크를 켠다
const spy=()=>{const nav=vs.report.hidden?null:vs.report.querySelector('.sub'); if(!nav) return;
  const ls=[...nav.querySelectorAll('a')].map(a=>[a,document.getElementById(a.getAttribute('href').slice(1))]).filter(x=>x[1]);
  let on=ls[0]&&ls[0][0]; ls.forEach(([a,el])=>{if(el.getBoundingClientRect().top<=90) on=a;});
  if(innerHeight+scrollY>=document.documentElement.scrollHeight-4&&ls.length) on=ls[ls.length-1][0];
  ls.forEach(([a])=>a.classList.toggle('on',a===on));};
addEventListener('scroll',()=>requestAnimationFrame(spy),{passive:true}); addEventListener('hashchange',()=>setTimeout(spy,50)); spy();
// 기술 학습: 주제를 고르면 그 주제에 쓰인 기술만 보인다
const tsub=document.getElementById('tsub');
if(tsub) tsub.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return;
  tsub.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('#tcards .tc').forEach(c=>c.hidden=!!b.dataset.t&&!c.dataset.topics.split(' ').includes(b.dataset.t));
  const top=tsub.getBoundingClientRect().top; if(top<0||top>innerHeight) tsub.scrollIntoView();});
document.querySelectorAll('button.cp').forEach(b=>b.addEventListener('click',()=>{
  const t=document.getElementById(b.dataset.src).textContent.trim();
  navigator.clipboard.writeText(t).then(()=>{const o=b.textContent;b.textContent='복사됨';setTimeout(()=>b.textContent=o,1200);});
}));
"""


def _e(s) -> str:
    return html.escape("" if s is None else str(s))


def _norm(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _label(ev: str) -> str:
    if ev.startswith("log:"):
        return "작업 로그"
    if "/" in ev:
        return ev.rsplit("/", 2)[-2] + "/" + ev.rsplit("/", 1)[-1]
    return ev[:7]


def _ul(items) -> str:
    return f'<ul class="b">{"".join(f"<li>{_e(x)}</li>" for x in items)}</ul>' if items else ""


def _ev(evidence: list[str], titles: dict) -> str:
    return "".join(f'<span title="{_e(titles.get(e, e))}">{_e(_label(e))}</span>' for e in evidence)


def _plain(report: dict, week: dict) -> str:
    lines = [f"[주간 작업] {week['start']} ~ {week['end']}"] + [f"■ {h}" for h in report["headline"]] + [""]
    for t in report["topics"]:
        lines.append(f"- {t['title']}: {t['one_line']}")
        lines += [f"  · [결정 필요] {x['text']}" for x in t.get("todo", []) if x["kind"] == "결정 필요"]
    if report["next_week"]:
        lines += ["", "다음 주"] + [f"- {x['text']}" for x in report["next_week"]]
    return "\n".join(lines)


def _topic(i: int, t: dict, tech_items: list[dict], titles: dict) -> str:
    rel = "".join(f'<a href="#{x["id"]}">{_e(x["name"])}</a>' for x in tech_items if t["title"] in x["topics"])
    decisions = sum(1 for x in t.get("todo", []) if x["kind"] == "결정 필요")
    todo = "".join(f'<li><span class="k k-{_e(x["kind"].split()[0])}">{_e(x["kind"])}</span><span>{_e(x["text"])}</span></li>' for x in t.get("todo", []))
    plain = "\n".join([t["title"], t["one_line"]] + ([f"상황: {t['context']}"] if t["context"] else []) + ([f"목적: {t['goal']}"] if t["goal"] else [])
                      + [f"- {d}" for d in t["done"]] + [f"검증: {r}" for r in t["results"]] + [f"남은 일[{x['kind']}]: {x['text']}" for x in t.get("todo", [])])
    rows = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in (
        ("상황", _e(t["context"])), ("목적", _e(t["goal"])), ("한 일", _ul(t["done"])), ("검증", _ul(t["results"])),
        ("남은 일", f'<div class="todo"><ul>{todo}</ul></div>' if todo else ""), ("관련 기술", f'<div class="chips">{rel}</div>' if rel else ""),
        ("근거", f'<div class="ev">{_ev(t["evidence"], titles)}</div>')) if v)
    return (f'<article id="topic{i}" class="tp{" unsup" if t["unsupported"] else ""}"><div class="tph"><h3>{_e(t["title"])}</h3>'
            f'<span class="pill cat">{_e(t["category"])}</span><span class="pill">{_e(t["workspace"])}</span>'
            + (f'<span class="pill dec">결정 필요 {decisions}</span>' if decisions else "")
            + ('<span class="pill warn">근거 확인 필요</span>' if t["unsupported"] else "")
            + f'<button class="cp" data-src="tp{i}">복사</button></div><div class="ol">{_e(t["one_line"])}</div><dl>{rows}</dl>'
            f'<pre id="tp{i}" hidden>{_e(plain)}</pre></article>')


def _tech(x: dict, week: dict, glossary: dict, tidx: dict, titles: dict) -> str:
    g = glossary.get(_norm(x["name"]), {})
    earlier = [w for w in g.get("weeks", []) if w < week["week"]]
    badge = f'<a class="pill" href="{_e(earlier[0])}.html#tech">처음 정리 {_e(earlier[0])} · {len(earlier) + 1}번째 등장</a>' if earlier else ""
    recorded = "".join(f'<li>{_e(r["text"])} <span class="ev">{_ev(r["evidence"], titles)}</span></li>' for r in x["rationale_recorded"])
    alt = "".join(f"<tr><td>{_e(a['name'])}</td><td>{_e(a['pros'])}</td><td>{_e(a['cons'])}</td><td>{_e(a['when'])}</td></tr>" for a in x["alternatives"])
    quiz = "".join(f'<details class="q"><summary>Q. {_e(q["q"])}</summary>{_e(q["a"])}</details>' for q in x["quiz"])
    comp = "".join(f'<li><b>{_e(c["name"])}</b> — {_e(c["why"])}</li>' for c in x["complements"])
    related = "".join(f'<a href="#topic{tidx[t]}">{_e(t)}</a>' for t in x["topics"] if t in tidx)
    reasons = (f'<ul class="b">{recorded}</ul>' if recorded else "") + "".join(f'<div class="gen"><b>근거 기록 없음</b>{_e(u)}</div>' for u in x.get("rationale_unverified", [])) \
        + f'<div class="gen"><b>일반론</b>{_e(x["rationale_general"])}</div>'
    rows = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in (
        ("보완재", f'<ul class="b">{comp}</ul>' if comp else ""), ("선택 근거", reasons), ("자가 점검", quiz),
        ("더 찾아볼 것", f'<div class="chips">{"".join(f"<span>{_e(k)}</span>" for k in x["keywords"])}</div>' if x["keywords"] else ""),
        ("관련 주제", f'<div class="chips">{related}</div>' if related else ""), ("근거", f'<div class="ev">{_ev(x["evidence"], titles)}</div>')) if v)
    topic_ids = " ".join(str(tidx[t]) for t in x["topics"] if t in tidx)
    return (f'<article id="{x["id"]}" class="tc" data-topics="{topic_ids}"><div class="tph"><h3>{_e(x["name"])}</h3><span class="pill cat">{_e(x["category"])}</span>'
            f'<span class="lv">{_e(x["level"])}</span>{badge}</div><div class="def">{_e(x["definition"])}</div>'
            f'<div class="two"><div class="box"><h4>핵심 개념</h4>{_ul(x["key_points"])}</div><div class="box"><h4>동작 원리</h4>{_ul(x["how_it_works"])}</div></div>'
            f'<div class="box ex"><h4>이번 작업에서의 예</h4>{_ul(x["example"])}</div>'
            f'<div class="two"><div class="box"><h4>쓸 때</h4>{_ul(x["when_to_use"])}</div><div class="box"><h4>피할 때</h4>{_ul(x["when_not_to_use"])}</div></div>'
            + (f'<div class="box pit"><h4>흔한 함정</h4>{_ul(x["pitfalls"])}</div>' if x["pitfalls"] else "")
            + (f'<div><h4>대체재 비교</h4><table class="alt"><thead><tr><th>대체재</th><th>장점</th><th>단점</th><th>더 맞는 상황</th></tr></thead><tbody>{alt}</tbody></table></div>' if alt else "")
            + f'<dl style="grid-template-columns:96px 1fr">{rows}</dl></article>')


def render(report: dict, week: dict, tech: dict | None = None, glossary: dict | None = None) -> str:
    tech = tech or {}
    tech_items, glossary = tech.get("items", []), glossary or {}
    titles = {o["sha"]: o["subject"] for o in week["other_commits"]}
    for f in week["features"]:
        for l in f.get("work_logs", []):
            titles.update({c["sha"]: c.get("subject", "") for c in l.get("commits", [])})
    start = date.fromisoformat(week["start"])
    rng = f"{start:%Y-%m-%d} ({DAYS[0]}) ~ {week['end']} ({DAYS[4]})"
    tidx = {t["title"]: i for i, t in enumerate(report["topics"])}

    gaps = [f'<li><code>{_e(m["ref"][:7])}</code> {_e(titles.get(m["ref"], ""))} — {_e(m["reason"])}</li>' for m in report["missing_context"]]
    listed = {m["ref"][:12] for m in report["missing_context"]}
    gaps += [f'<li><code>{_e(s[:7])}</code> {_e(titles.get(s, ""))} — 어느 주제에도 묶이지 않음</li>' for s in report["uncovered_commits"] if s[:12] not in listed]

    by_day = defaultdict(list)
    for o in week["other_commits"]:
        by_day[o["day"]].append((o["at"][11:16], o["workspace"], o["subject"]))
    for f in week["features"]:
        for l in f.get("work_logs", []):
            by_day[l["at"][:10]].append((l["at"][11:16], f["workspace"], f"[{f['title']}] 작업 완료 기록"))
    timeline = "".join(
        f'<div class="day">{_e(d)} ({DAYS[date.fromisoformat(d).weekday()]})</div>'
        + "".join(f'<div class="it"><span class="mono">{_e(t)}</span><span class="ws">{_e(w)}</span><span>{_e(s)}</span></div>' for t, w, s in sorted(rows))
        for d, rows in sorted(by_day.items()))

    plan = "".join(f'<li><span class="st st-{_e(p["status"].split()[0])}">{_e(p["status"])}</span>{_e(p["text"])}</li>' for p in report.get("last_week_plan", []))
    sections = [s for s in [
        ("sec-plan", "지난주 계획 대비", len(report.get("last_week_plan", [])), f'<ul class="list">{plan}</ul>'),
        ("sec-topics", "주제", len(report["topics"]), f'<div class="cards">{"".join(_topic(i, t, tech_items, titles) for i, t in enumerate(report["topics"]))}</div>'),
        ("sec-blocked", "막힌 것", len(report["blocked"]), f'<ul class="list blk">{"".join(f"<li>{_e(x['text'])}</li>" for x in report["blocked"])}</ul>'),
        ("sec-next", "다음 주", len(report["next_week"]), f'<ul class="list">{"".join(f"<li>{_e(x['text'])}</li>" for x in report["next_week"])}</ul>'),
        ("sec-gaps", "설명이 부족한 작업", len(gaps), f'<ul class="list">{"".join(gaps)}</ul>'),
        ("sec-days", "요일별 기록", len(by_day), f'<details class="days"><summary>펼치기</summary>{timeline}</details>'),
    ] if s[2]]
    sub = "".join(f'<a href="#{sid}">{_e(name)}<span class="n">{n}</span></a>' for sid, name, n, _ in sections)
    report_view = (f'<ul class="head">{"".join(f"<li>{_e(h)}</li>" for h in report["headline"])}</ul>'
                   f'<nav class="sub" aria-label="주간 작업 목차">{sub}</nav>'
                   + "".join(f'<section class="s" id="{sid}"><h2>{_e(name)}</h2>{body}</section>' for sid, name, _, body in sections))

    by_cat = defaultdict(list)
    for x in tech_items:
        by_cat[x["category"]].append(x)
    toc = "".join(f'<div><b>{_e(c)}</b>' + "".join(f'<span class="chips"><a href="#{x["id"]}">{_e(x["name"])}</a></span><span class="lv">{_e(x["level"])}</span>' for x in xs) + "</div>"
                  for c, xs in by_cat.items())
    per_topic = [(i, t["title"], sum(1 for x in tech_items if t["title"] in x["topics"])) for i, t in enumerate(report["topics"])]
    tsub = (f'<button type="button" class="on" data-t="">전체<span class="n">{len(tech_items)}</span></button>'
            + "".join(f'<button type="button" data-t="{i}">{_e(title)}<span class="n">{n}</span></button>' for i, title, n in per_topic if n))
    tech_view = (f'<div class="learn"><h2>이번 주 배운 것</h2>{_ul(tech.get("learning_summary", []))}<div class="toc">{toc}</div></div>'
                 f'<nav class="sub" id="tsub" aria-label="주제별 기술">{tsub}</nav>'
                 f'<div class="cards" id="tcards" style="margin-top:18px">{"".join(_tech(x, week, glossary, tidx, titles) for x in tech_items)}</div>')

    body = (f'<a class="back" href="index.html">← 전체 주 목록</a>'
            f'<div class="top"><h1>주간 작업</h1><span class="range">{_e(week["week"])} · {_e(rng)}</span>'
            f'<button class="cp" data-src="plain" style="margin-left:auto">전체 복사</button></div>'
            f'<nav class="tabs"><a href="#report">주간 작업</a><a href="#tech">기술 학습 {len(tech_items)}</a></nav>'
            f'<section id="v-report" class="view">{report_view}</section>'
            f'<section id="v-tech" class="view" hidden>{tech_view}</section>'
            f'<pre id="plain" hidden>{_e(_plain(report, week))}</pre>')
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>주간 작업 {_e(week["week"])}</title><style>{CSS}</style></head><body><div class="wrap">{body}</div><script>{JS}</script></body></html>\n')
