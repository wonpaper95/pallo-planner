// 🧭 PC: 주 목록을 왼쪽 탭 사이드바 밑으로 옮기고, 사이드바가 상단 바 바로 밑에서 시작하게 높이를 잼
// ponytail: 첫 로드 때 화면 너비로만 정함 — 창을 폰 너비↔PC 너비로 바꾸면 새로고침해야 맞음
if (matchMedia("(min-width: 900px)").matches) {
  document.querySelector(".seg").append(document.getElementById("weeks"));
  document.body.classList.add("side-on");
  const hh = () => document.documentElement.style.setProperty("--hh", document.querySelector("header").offsetHeight + "px");
  hh(); new ResizeObserver(hh).observe(document.querySelector("header"));
}
