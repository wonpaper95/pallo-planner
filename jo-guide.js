// 🧑‍🎓 조교 가이드 화면 — 내용은 jo-guide-data.js(JG). 플래너 [조교 가이드] 탭과 로그인 없는 사전숙제 링크(guide.html)가 같이 씀.
// 체크·퀴즈 점수는 이 기기에만 저장(localStorage) — DB 없음.
(() => {
  const KEY = "jg-state";
  const TABS = [["pre", "사전 준비"], ["d1", "1일차"], ["d2", "2일차"], ["d3", "3일차"], ["d4", "4일차"], ["ref", "📚 찾아보기"]];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  let st = load(); st.c ||= {};
  let el, opts = {}, tab = "pre", q = "";
  try { tab = localStorage.getItem("jg-tab") || "pre"; } catch {}
  let lang = "en"; // 🇯🇵 일본어 가이드: REF 의 ja 본문을 씀. 링크 ?lang=ja 가 먼저, 없으면 이 기기에서 고른 것
  try { lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("jg-lang") || "en"; } catch {}
  const txt = (r) => (lang === "ja" && r.ja) || r.body;
  const REF = () => Object.fromEntries(JG.REF.map((r) => [r.id, r]));

  function body(lines) {
    let h = "", ul = false;
    for (const x of lines) {
      const li = typeof x === "string" && x.startsWith("• ");
      if (li && !ul) { h += "<ul>"; ul = true; } else if (!li && ul) { h += "</ul>"; ul = false; }
      if (x.table) h += `<div class="jgtw"><table>${x.table.map((r, i) => `<tr${x.hi?.includes(i) ? ' class="hi"' : ""}>${r.map((c) => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join("")}</tr>`).join("")}</table></div>`;
      else if (li) h += `<li>${imp(x.slice(2))}</li>`;
      else h += `<p${x.startsWith("❗") ? ' class="jgwarn"' : ""}>${imp(x)}</p>`;
    }
    return h + (ul ? "</ul>" : "");
  }
  const imp = (s) => esc(s).replace(/\(중요!!\)/g, '<b class="jgimp">(중요!!)</b>'); // 전화·회신 강조
  const shots = (r) => (r.img || []).map((f) => `<a class="jgshot" href="img/jg/${f}.jpg" target="_blank" rel="noopener"><img src="img/jg/${f}.jpg" alt="${esc(r.t)} 실제 화면" loading="lazy"></a>`).join("") + (r.img ? '<p class="jgcap">실제 전산 화면 · 이름·번호·메모는 예시로 바꿨어요 · 누르면 크게</p>' : "");
  const br = (r) => r.br ? ` <span class="jgbr" title="이 지점 기준이에요 — 우리 지점에 맞게 읽어요">${esc(r.br)} 기준</span>` : "";
  const refBox = (ids, open) => (ids || []).map((id) => { const r = REF()[id]; return r ? `<details class="jgref"${open ? " open" : ""}><summary>📖 ${esc(r.t)}${br(r)}</summary>${body(txt(r))}${shots(r)}</details>` : ""; }).join("");
  const ck = (id, label, sub) => `<label class="jgck${st.c[id] ? " on" : ""}"><input type="checkbox" data-jgc="${id}"${st.c[id] ? " checked" : ""}><span><b>${esc(label)}</b>${sub ? `<small>${sub}</small>` : ""}</span></label>`;
  const doneOf = (d) => d.pass.filter((_, i) => st.c[`d${d.day}-${i}`]).length;

  function head() {
    const chips = TABS.map(([k, n]) => {
      const d = JG.DAYS.find((x) => `d${x.day}` === k);
      const ok = k === "pre" ? JG.PRE.hw.every((h) => st.c[h.id]) : d && doneOf(d) === d.pass.length;
      return `<button data-jgt="${k}" class="${tab === k ? "on" : ""}${ok ? " ok" : ""}">${ok ? "✓ " : ""}${n}</button>`;
    }).join("");
    return `<div class="jghead"><div class="jgtitle"><h2>🧑‍🎓 조교 온보딩 · 1주일${lang === "ja" ? " · 일본어" : ""}</h2>
      <div class="jglang">${[["en", "🇺🇸 영어"], ["ja", "🇯🇵 일본어"]].map(([k, n]) => `<button data-jgl="${k}" class="${lang === k ? "on" : ""}">${n}</button>`).join("")}</div>
      ${opts.standalone ? "" : `<button class="jgbtn" data-jgcopy title="로그인 없이 열리는 사전숙제 링크">🔗 사전숙제 링크 복사</button>`}</div>
      <p class="jgsub">사전 준비 → 1~4일차 → 5일차부터 혼자 근무. <span class="must">🔴 필수</span> = 2시간 30분 근무도 이것만은 · <span class="add">🟡 추가</span> = 4시간 근무면 더</p>
      <nav class="jgtabs">${chips}</nav></div>`;
  }

  function pre() {
    const P = JG.PRE;
    const mins = P.read.reduce((a, r) => a + r.min, 0);
    return `<div class="jgcard"><h3>📖 출근 전에 읽어 오기 <small>약 ${Math.round(mins / 10) * 10}분</small></h3><p class="jgmut">${esc(P.goal)}</p>
      ${P.read.map((r, i) => `<details class="jgread"><summary><b>${"①②③④⑤⑥⑦⑧"[i]} ${esc(r.t)}</b><small>${r.min}분</small></summary>${r.note ? `<p class="jgmut">${esc(r.note)}</p>` : ""}${refBox(r.ref, r.ref.length === 1)}</details>`).join("")}</div>
      <div class="jgcard"><h3>✍️ 사전 숙제 <small>${P.hw.filter((h) => st.c[h.id]).length}/${P.hw.length}</small></h3>
      ${P.hw.map((h) => ck(h.id, h.t, esc(h.how)) + (h.ref ? `<div class="jgin">${refBox(h.ref)}</div>` : "")).join("")}</div>
      ${quiz()}`;
  }

  function quiz() {
    const r = st.quiz;
    return `<div class="jgcard" id="jgquiz"><h3>📝 셀프 퀴즈 <small>${st.best != null ? `최고 ${st.best}점` : "10문제 · 80점 이상이면 통과"}</small></h3>
      ${JG.QUIZ.map((x, i) => {
        const a = r?.[i], res = r ? (a === x.ok ? "ok" : "no") : "";
        return `<div class="jgq ${res}"><b>${i + 1}. ${esc(x.q)}</b>${x.a.map((t, j) => `<label><input type="radio" name="jgq${i}" value="${j}"${a === j ? " checked" : ""}> ${esc(t)}</label>`).join("")}
          ${r ? `<p class="jgwhy">${res === "ok" ? "✓ 정답" : "✗ 정답: " + esc(x.a[x.ok])} — ${esc(x.why)}</p>` : ""}</div>`;
      }).join("")}
      <div class="jgrow"><button class="jgbtn pri" data-jgscore>채점하기</button>${r ? `<button class="jgbtn" data-jgretry>다시 풀기</button><b class="jgscore">${score(r)}점</b>` : ""}</div></div>`;
  }
  const score = (r) => JG.QUIZ.filter((x, i) => r[i] === x.ok).length * 10;

  function day(d) {
    const step = (s) => `<details class="jgstep ${s.must ? "must" : "add"}"><summary><span class="tag">${s.must ? "🔴" : "🟡"}</span><span class="when">${esc(s.when)}</span><b>${esc(s.t)}</b></summary>
      ${s.how ? body(s.how.map((x) => "• " + x)) : ""}${refBox(s.ref)}</details>`;
    const must = d.steps.filter((s) => s.must), add = d.steps.filter((s) => !s.must);
    return `<div class="jgcard"><h3>${d.day}일차 · ${esc(d.title)}</h3><p class="jggoal">🎯 ${esc(d.goal)}</p>${d.tip ? `<p class="jgmut">💡 ${esc(d.tip)}</p>` : ""}${(d.files || []).map(([f, n]) => `<a class="jgbtn" href="${f}" target="_blank" rel="noopener">📄 ${esc(n)}</a>`).join(" ")}</div>
      <div class="jgcard"><h3>오늘 순서</h3>${must.map(step).join("")}${add.length ? `<h4>🟡 4시간 근무면 이어서</h4>${add.map(step).join("")}` : ""}</div>
      <div class="jgcard"><h3>✅ 통과 체크 <small>${doneOf(d)}/${d.pass.length} · 매니저와 같이 확인</small></h3>
      ${d.pass.map((p, i) => ck(`d${d.day}-${i}`, p)).join("")}</div>
      ${d.after ? `<div class="jgcard jgafter"><h3>🚀 5일차부터</h3><p>${esc(d.after)}</p></div>` : ""}`;
  }

  function ref() {
    const k = q.trim().toLowerCase();
    const hit = (r) => !k || JSON.stringify([r.t, r.ch, txt(r)]).toLowerCase().includes(k);
    const chs = [...new Set(JG.REF.map((r) => r.ch))];
    const html = chs.map((c) => { const rs = JG.REF.filter((r) => r.ch === c && hit(r)); return rs.length ? `<h4>${esc(c)}</h4>${refBox(rs.map((r) => r.id), !!k)}` : ""; }).join("");
    return `<div class="jgcard"><h3>📚 전체 가이드북 — 필요할 때 찾아보기</h3><p class="jgmut">1~4일차에 안 넣은 업무(신규 등록·결제·환불·구멤버·재무 등)도 다 여기 있어요. 처음 하는 건 매니저와 같이.</p>
      <input class="jgsearch" type="search" placeholder="검색 (예: 환불, 연기, QR)" value="${esc(q)}"><div class="jgres">${html || '<p class="jgmut">찾는 내용이 없어요.</p>'}</div></div>`;
  }

  function render() {
    if (!el) return;
    const d = JG.DAYS.find((x) => `d${x.day}` === tab);
    el.innerHTML = `<div class="jg">${head()}${tab === "ref" ? ref() : d ? day(d) : pre()}
      <p class="jgfoot">체크는 이 기기에만 저장돼요. <button class="jglink" data-jgreset>체크 모두 지우기</button></p></div>`;
  }
  const go = (t) => { tab = t; try { localStorage.setItem("jg-tab", t); } catch {} render(); scrollTo(0, 0); };

  function bind() {
    el.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-jgt]"); if (t) return go(t.dataset.jgt);
      const l = e.target.closest("[data-jgl]"); if (l) { lang = l.dataset.jgl; try { localStorage.setItem("jg-lang", lang); } catch {} return render(); }
      if (e.target.closest("[data-jgscore]")) {
        const r = JG.QUIZ.map((_, i) => { const v = el.querySelector(`input[name=jgq${i}]:checked`); return v ? +v.value : null; });
        if (r.includes(null) && !confirm(`안 푼 문제가 ${r.filter((x) => x == null).length}개 있어요. 그래도 채점할까요?`)) return;
        st.quiz = r; const s = score(r); st.best = Math.max(st.best ?? 0, s); if (s >= 80) st.c["hw-quiz"] = true;
        save(); render(); el.querySelector("#jgquiz")?.scrollIntoView({ block: "start" }); return;
      }
      if (e.target.closest("[data-jgretry]")) { delete st.quiz; save(); render(); el.querySelector("#jgquiz")?.scrollIntoView({ block: "start" }); return; }
      if (e.target.closest("[data-jgreset]") && confirm("이 기기의 체크와 퀴즈 점수를 모두 지울까요?")) { st = { c: {} }; save(); return render(); }
      if (e.target.closest("[data-jgcopy]")) {
        const url = new URL("guide.html", location.href.split("?")[0]).href + (lang === "ja" ? "?lang=ja" : "");
        try { await navigator.clipboard.writeText(url); (window.toast || alert)(`🔗 ${lang === "ja" ? "일본어 " : ""}사전숙제 링크를 복사했어요 — 카톡에 붙여 보내세요`); } catch { prompt("이 링크를 복사해 보내세요", url); }
      }
    });
    el.addEventListener("change", (e) => {
      const c = e.target.dataset?.jgc; if (!c) return;
      if (e.target.checked) st.c[c] = true; else delete st.c[c];
      save(); const y = scrollY; render(); scrollTo(0, y);
    });
    el.addEventListener("input", (e) => {
      if (!e.target.classList.contains("jgsearch")) return;
      q = e.target.value; // 검색칸은 그대로 두고 결과만 바꿔야 입력이 안 끊김
      const tmp = document.createElement("div"); tmp.innerHTML = ref(); el.querySelector(".jgres").replaceWith(tmp.querySelector(".jgres"));
    });
  }

  window.JGUIDE = {
    mount(target, o = {}) { if (el !== target) { el = target; opts = o; bind(); } render(); },
  };
})();
