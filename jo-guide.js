// 🧑‍🎓 조교 가이드 화면 — 내용은 jo-guide-data.js(JG). 플래너 [조교 가이드] 탭과 로그인 없는 사전숙제 링크(guide.html)가 같이 씀.
// 체크·퀴즈 점수는 이 기기에 저장(localStorage). 플래너 안에서 조교가 '나'(조교체크리스트 이름)를 고르면 jc_guide(0073)에도 저장 →
// 조교는 📍 지금 몇 일차를 크게 보고, 같은 지점 매니저·대표는 조교별 진행표를 봄 (올리비아 신고 10-29). 사전숙제 링크(guide.html)는 기기에만.
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
  const shots = (r) => (r.img || []).map((f) => `<a class="jgshot" href="img/jg/${f}.jpg" target="_blank" rel="noopener"><img src="img/jg/${f}.jpg" alt="${esc(r.t)} ${r.cap ? "예시" : "실제"} 화면" loading="lazy"></a>`).join("") + (r.img ? `<p class="jgcap">${esc(r.cap || "실제 전산 화면 · 이름·번호·메모는 예시로 바꿨어요 · 누르면 크게")}</p>` : ""); // cap = 예시 화면(가짜 데이터) 설명
  const br = (r) => r.br ? ` <span class="jgbr" title="이 지점 기준이에요 — 우리 지점에 맞게 읽어요">${esc(r.br)} 기준</span>` : "";
  const refBox = (ids, open) => (ids || []).map((id) => { const r = REF()[id]; return r ? `<details class="jgref"${open ? " open" : ""}><summary>📖 ${esc(r.t)}${br(r)}</summary>${body(txt(r))}${shots(r)}</details>` : ""; }).join("");
  const ck = (id, label, sub) => `<label class="jgck${st.c[id] ? " on" : ""}"><input type="checkbox" data-jgc="${id}"${st.c[id] ? " checked" : ""}><span><b>${esc(label)}</b>${sub ? `<small>${sub}</small>` : ""}</span></label>`;
  const doneOf = (d, c = st.c) => d.pass.filter((_, i) => c[`d${d.day}-${i}`]).length;
  // 단계별 끝났나 (사전 준비 = 숙제 전부, n일차 = 통과 체크 전부) → 지금 단계 = 처음 안 끝난 단계
  const okOf = (k, c) => { const d = JG.DAYS.find((x) => `d${x.day}` === k); return k === "pre" ? JG.PRE.hw.every((h) => c[h.id]) : !!d && doneOf(d, c) === d.pass.length; };
  const STAGES = TABS.filter(([k]) => k !== "ref");
  const nowOf = (c) => STAGES.find(([k]) => !okOf(k, c)) ?? null; // null = 다 끝남
  const nowTxt = (c) => { const n = nowOf(c); return n ? `📍 지금 ${n[1]}` : "🎉 4일차까지 통과 — 5일차부터 혼자 근무"; };
  const steps = (c, big) => `<div class="jgsteps${big ? " big" : ""}">${STAGES.map(([k, n]) => { const ok = okOf(k, c), cur = nowOf(c)?.[0] === k; return `<span class="${ok ? "ok" : cur ? "cur" : ""}">${ok ? "✓ " : cur ? "📍 " : ""}${n}</span>`; }).join("")}</div>`;

  // ── 플래너 연동 (조교: 나 고르기 + 저장 / 매니저·대표: 조교별 진행표) ──
  const live = () => !opts.standalone && typeof sb !== "undefined" && typeof me !== "undefined" && !!me;
  const isJo = () => typeof myRole !== "undefined" && myRole === "assistant";
  const LV = { team: null, names: [], rows: [], meId: null, ready: false };
  const meKey = () => `jg-me-${LV.team}`;
  async function liveLoad() {
    if (!live()) return;
    LV.team = (typeof previewTeam !== "undefined" && previewTeam) || (await sb.rpc("my_team")).data || (await sb.rpc("assistant_team")).data || null;
    const boss = typeof isBoss !== "undefined" && isBoss && !LV.team;
    let qn = sb.from("jc_names").select("id, name, team_id, sort").order("sort").order("id"), qg = sb.from("jc_guide").select("name_id, c, best, updated_at");
    if (!boss) { if (!LV.team) return; qn = qn.eq("team_id", LV.team); qg = qg.eq("team_id", LV.team); }
    const [n, g, t] = await Promise.all([qn, qg, boss ? sb.from("teams").select("id, name, sort").order("sort") : { data: [] }]);
    if (n.error || g.error) return;
    LV.names = n.data; LV.rows = g.data; LV.teams = t.data ?? []; LV.boss = boss; LV.ready = true;
    if (isJo()) {
      try { LV.meId = +localStorage.getItem(meKey()) || null; } catch {}
      if (!LV.names.some((x) => x.id === LV.meId)) LV.meId = null;
      const row = LV.rows.find((r) => r.name_id === LV.meId);
      if (row) { st.c = { ...row.c }; if (row.best != null) st.best = row.best; save(); } // 서버 것이 기준(다른 기기에서 한 것도)
    }
    render();
  }
  let pushT;
  const push = () => { // 조교가 '나'를 골랐으면 체크·최고점을 서버에도 (0.6초 모아서)
    if (!live() || !isJo() || !LV.meId) return;
    clearTimeout(pushT); pushT = setTimeout(async () => {
      const { error } = await sb.from("jc_guide").upsert({ name_id: LV.meId, team_id: LV.team, c: st.c, best: st.best ?? null });
      if (error) (window.toast || console.error)("진행 저장 실패: " + error.message);
    }, 600);
  };
  function liveBox() {
    if (!live() || !LV.ready) return "";
    if (isJo()) return `<div class="jgme"><label>🧑‍🎓 나: <select data-jgme><option value="">이름 고르기</option>${LV.names.map((n) => `<option value="${n.id}"${n.id === LV.meId ? " selected" : ""}>${esc(n.name)}</option>`).join("")}</select></label>
      ${LV.meId ? `<b class="jgnow">${nowTxt(st.c)}</b>${steps(st.c, true)}<small class="jgmut">체크가 매니저님 화면에도 보여요</small>` : `<small class="jgmut">내 이름을 고르면 진행이 저장되고 매니저님도 봐요 (조교체크리스트 '조교 이름'에 없으면 매니저님께 말씀)</small>`}</div>`;
    const by = new Map(LV.rows.map((r) => [r.name_id, r])), md = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
    const list = (ns) => ns.map((n) => { const r = by.get(n.id), c = r?.c ?? {};
      return `<tr><td><b>${esc(n.name)}</b></td><td>${r ? `<b>${nowTxt(c)}</b>` : `<span class="jgmut">아직 시작 안 함</span>`}</td><td>${steps(c)}</td><td class="jgmut">${r ? `${r.best != null ? `퀴즈 ${r.best}점 · ` : ""}${md(r.updated_at)}` : ""}</td></tr>`; }).join("");
    const groups = LV.boss ? LV.teams.map((t) => [t.name, LV.names.filter((n) => n.team_id === t.id)]).filter(([, ns]) => ns.length) : [["", LV.names]];
    return `<details class="jgcard jgprog" open><summary><h3 style="display:inline">👥 우리 조교 진행 <small>조교가 조교 링크에서 '나'를 고르고 체크한 것</small></h3></summary>
      ${groups.length ? groups.map(([tn, ns]) => `${tn ? `<h4>${esc(tn)}</h4>` : ""}<div class="jgtw"><table class="jgpt">${list(ns)}</table></div>`).join("") : `<p class="jgmut">조교체크리스트에 조교 이름이 아직 없어요.</p>`}</details>`;
  }

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
      <nav class="jgtabs">${chips}</nav>${liveBox()}</div>`;
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
      <p class="jgfoot">${live() && isJo() && LV.meId ? "체크는 이 기기와 플래너(매니저 화면)에 저장돼요." : "체크는 이 기기에만 저장돼요."} <button class="jglink" data-jgreset>체크 모두 지우기</button></p></div>`;
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
        save(); push(); render(); el.querySelector("#jgquiz")?.scrollIntoView({ block: "start" }); return;
      }
      if (e.target.closest("[data-jgretry]")) { delete st.quiz; save(); render(); el.querySelector("#jgquiz")?.scrollIntoView({ block: "start" }); return; }
      if (e.target.closest("[data-jgreset]") && confirm("체크와 퀴즈 점수를 모두 지울까요?")) { st = { c: {} }; save(); push(); return render(); }
      if (e.target.closest("[data-jgcopy]")) {
        const url = new URL("guide.html", location.href.split("?")[0]).href + (lang === "ja" ? "?lang=ja" : "");
        try { await navigator.clipboard.writeText(url); (window.toast || alert)(`🔗 ${lang === "ja" ? "일본어 " : ""}사전숙제 링크를 복사했어요 — 카톡에 붙여 보내세요`); } catch { prompt("이 링크를 복사해 보내세요", url); }
      }
    });
    el.addEventListener("change", (e) => {
      if (e.target.matches?.("[data-jgme]")) { // 🧑‍🎓 나 고르기 — 서버에 기록 있으면 그걸로, 없으면 이 기기 체크를 올림
        LV.meId = +e.target.value || null; try { localStorage.setItem(meKey(), LV.meId ?? ""); } catch {}
        const row = LV.rows.find((r) => r.name_id === LV.meId); if (row) { st.c = { ...row.c }; st.best = row.best ?? st.best; save(); } else push();
        return render();
      }
      const c = e.target.dataset?.jgc; if (!c) return;
      if (e.target.checked) st.c[c] = true; else delete st.c[c];
      save(); push(); const y = scrollY; render(); scrollTo(0, y);
    });
    el.addEventListener("input", (e) => {
      if (!e.target.classList.contains("jgsearch")) return;
      q = e.target.value; // 검색칸은 그대로 두고 결과만 바꿔야 입력이 안 끊김
      const tmp = document.createElement("div"); tmp.innerHTML = ref(); el.querySelector(".jgres").replaceWith(tmp.querySelector(".jgres"));
    });
  }

  window.JGUIDE = {
    mount(target, o = {}) { if (el !== target) { el = target; opts = o; bind(); } render(); liveLoad(); },
  };
})();
