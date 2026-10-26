// 🌗 화면 모드: 자동(기기 설정) → 다크 → 라이트 순서로 바뀜. 기기마다 따로 기억(localStorage) — 위젯도 같은 값을 따름.
// <head> 에서 CSS 보다 먼저 실행 → 깜빡임 없음. html[data-theme] 를 glass.css·widget.css 가 읽음.
(() => {
  const KEY = "planner-theme", MODES = { auto: ["🌗", "자동"], dark: ["🌙", "다크"], light: ["☀️", "라이트"] };
  const mq = matchMedia("(prefers-color-scheme: light)");
  const get = () => { try { return MODES[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "auto"; } catch (e) { return "auto"; } };
  const apply = () => {
    const m = get(), t = m === "auto" ? (mq.matches ? "light" : "dark") : m;
    document.documentElement.dataset.theme = t;
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => { x.removeAttribute("media"); x.content = t === "light" ? "#f3f1f9" : "#0b0a14"; });
    const b = document.getElementById("themeBtn");
    if (b) { b.innerHTML = `${MODES[m][0]}<span class="lbl"> ${MODES[m][1]}</span>`; b.title = `화면 모드: ${MODES[m][1]} (누르면 바뀜)`; }
  };
  apply();
  mq.addEventListener("change", apply);
  addEventListener("storage", (e) => { if (e.key === KEY) apply(); }); // 플래너에서 바꾸면 열려 있는 위젯도 바로
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#themeBtn")) return;
    const ks = Object.keys(MODES), next = ks[(ks.indexOf(get()) + 1) % ks.length];
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply();
  });
})();
