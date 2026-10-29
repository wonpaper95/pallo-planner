// 🌏 언어교환 공개 신청폼 설정 — 플래너와 같은 Supabase (publishable key 는 공개돼도 안전: anon 은 등록 함수·신청 넣기·진행 중 이벤트 읽기만, DB 0075_gx)
// localhost 로 열면 로컬 Supabase, 그 외엔 운영. 지점 id 는 DB 에 저장되고 링크(?b=id)에 쓰임 — 플래너 지점 이름 짝은 ../gx.js BR
window.CONFIG = Object.assign(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" }
  : { SUPABASE_URL: "https://aiqrchgwrfrmscstlsmv.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_7Ow6aJe56IBVpgJAgp2Bsg_RPtA6X0y" }, {
  INSTAGRAM_HANDLE: { "daegu-jpcn": "pallo_daegu_jpch", ulsan: "pallo_ulsan" }[new URLSearchParams(location.search).get("b")] || "pallo_daegu_dsr", // 링크 지점(?b=) 인스타, 없으면 대구 영어점
  BRANCHES: [
    { id: "daegu-en",   en: "Daegu · English (Dongseong-ro)",   ko: "대구 영어점" },
    { id: "daegu-jpcn", en: "Daegu · Japanese & Chinese",      ko: "대구 일본어·중국어점" },
    { id: "ulsan",      en: "Ulsan (Samsan)",                  ko: "울산점" },
  ],
});
