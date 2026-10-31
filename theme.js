// 🌗 화면 모드: 자동(기기 설정) → 다크 → 라이트 순서로 바뀜. 기기마다 따로 기억(localStorage) — 위젯도 같은 값을 따름.
// <head> 에서 CSS 보다 먼저 실행 → 깜빡임 없음. html[data-theme] 를 glass.css·widget.css 가 읽음.
// 🎨 디자인(10-31): html[data-skin] 을 skins.css 가 읽음. 고르면 계정 prefs.skin 에 저장(index.html) + 여기 localStorage 에 복사(로그인 전 첫 화면용).
// 디자인마다 모드 하나로 고정 → 🌗 버튼 숨김. 리퀴드 글래스(기본)만 🌗 그대로.
(() => {
  const KEY = "planner-theme", SKEY = "planner-skin", MODES = { auto: ["🌗", "자동"], dark: ["🌙", "다크"], light: ["☀️", "라이트"] };
  // [이름, 모드, 미리보기 색 3개, Google Fonts family (없으면 기기 글꼴)]
  const SKINS = {
    glass: ["리퀴드 글래스 (기본)", null, ["#0b0a14", "#a58cf0", "#e0d120"]],
    chiikawa: ["말랑 파스텔 · 치이카와풍", "light", ["#fff7f4", "#f497ad", "#79cfb2"], "family=Gowun+Dodum&family=Jua"],
    nike: ["볼드 스포츠 · 나이키풍", "light", ["#ffffff", "#111111", "#d4ff3a"], "family=Archivo+Black&family=Inter:wght@400;600;800"],
    toss: ["클린 핀테크 · 토스풍", "light", ["#f2f4f6", "#3182f6", "#ffffff"]],
    spotify: ["다크 뮤직 · 스포티파이풍", "dark", ["#121212", "#1ed760", "#ffffff"], "family=Inter:wght@400;600;800"],
    notion: ["종이 노트 · 노션풍", "light", ["#ffffff", "#37352f", "#2383e2"], "family=Noto+Serif+KR:wght@600;700"],
    duolingo: ["게임 레슨 · 듀오링고풍", "light", ["#ffffff", "#58cc02", "#1cb0f6"], "family=Jua"],
    linear: ["개발툴 다크 · 리니어풍", "dark", ["#0f0f11", "#8b74e0", "#e8e8ed"], "family=Inter:wght@400;500;600"],
    airbnb: ["따뜻한 여행 · 에어비앤비풍", "light", ["#ffffff", "#ff385c", "#222222"]],
    baemin: ["민트 B급 · 배민풍", "light", ["#2ac1bc", "#ffffff", "#2b2b2b"], "family=Do+Hyeon"],
    insta: ["그라디언트 SNS · 인스타그램풍", "light", ["#ffffff", "#d62976", "#fa7e1e"], "family=Grand+Hotel"],
  };
  const mq = matchMedia("(prefers-color-scheme: light)");
  const get = () => { try { return MODES[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "auto"; } catch (e) { return "auto"; } };
  const skin = () => { try { return SKINS[localStorage.getItem(SKEY)] ? localStorage.getItem(SKEY) : "glass"; } catch (e) { return "glass"; } };
  const font = (s) => { // 고른 디자인 글꼴만 불러옴 (한 번)
    const f = SKINS[s][3]; if (!f || document.getElementById("skinFont-" + s)) return;
    const l = document.createElement("link"); l.id = "skinFont-" + s; l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?${f}&display=swap`;
    document.head.appendChild(l);
  };
  const apply = () => {
    const s = skin(), m = get(), fixed = SKINS[s][1], t = fixed || (m === "auto" ? (mq.matches ? "light" : "dark") : m);
    const de = document.documentElement;
    if (s === "glass") delete de.dataset.skin; else { de.dataset.skin = s; font(s); }
    de.dataset.theme = t;
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => { x.removeAttribute("media"); x.content = s === "glass" ? (t === "light" ? "#f3f1f9" : "#0b0a14") : SKINS[s][2][0]; });
    const b = document.getElementById("themeBtn");
    if (b) { b.innerHTML = `${MODES[m][0]}<span class="lbl"> ${MODES[m][1]}</span>`; b.title = `화면 모드: ${MODES[m][1]} (누르면 바뀜)`; b.classList.toggle("hidden", !!fixed); }
  };
  globalThis.plannerSkin = { SKINS, get: skin, set(s) { if (!SKINS[s] || s === skin()) return; try { localStorage.setItem(SKEY, s); } catch (e) {} apply(); } };
  apply();
  mq.addEventListener("change", apply);
  addEventListener("storage", (e) => { if (e.key === KEY || e.key === SKEY) apply(); }); // 플래너에서 바꾸면 열려 있는 위젯도 바로
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#themeBtn")) return;
    const ks = Object.keys(MODES), next = ks[(ks.indexOf(get()) + 1) % ks.length];
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply();
  });
})();
