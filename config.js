// publishable key는 공개돼도 안전함: 데이터 접근은 로그인 + RLS(자기 것만)가 막는다.
// localhost 로 열면 로컬 Supabase(~/.cache/pallo-planner-dev), 그 외엔 운영.
window.CONFIG = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" }
  : { SUPABASE_URL: "https://aiqrchgwrfrmscstlsmv.supabase.co", SUPABASE_KEY: "sb_publishable_7Ow6aJe56IBVpgJAgp2Bsg_RPtA6X0y" };
