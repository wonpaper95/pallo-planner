// 🧭 PC: 주 목록을 왼쪽 탭 사이드바 밑으로 옮기고, 사이드바가 상단 바 바로 밑에서 시작하게 높이를 잼
// ponytail: 첫 로드 때 화면 너비로만 정함 — 창을 폰 너비↔PC 너비로 바꾸면 새로고침해야 맞음
if (matchMedia("(min-width: 900px)").matches) {
  document.querySelector(".seg").append(document.getElementById("weeks"));
  document.body.classList.add("side-on");
  const hh = () => document.documentElement.style.setProperty("--hh", document.querySelector("header").offsetHeight + "px");
  hh(); new ResizeObserver(hh).observe(document.querySelector("header"));
  // ⇤ 왼쪽 메뉴 접기·펼치기 (기본 펼침, 기기에 기억 side-off) — 마야 요청 10-29
  const btn = document.getElementById("sideBtn"), set = (off) => { document.body.classList.toggle("side-off", off); btn.textContent = off ? "☰" : "⇤"; btn.title = off ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 접기"; };
  try { set(localStorage.getItem("side-off") === "1"); } catch { set(false); }
  btn.onclick = () => { const off = !document.body.classList.contains("side-off"); set(off); try { localStorage.setItem("side-off", off ? "1" : "0"); } catch {} };
}
