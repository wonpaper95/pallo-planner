#!/bin/zsh
# 사용: zsh scripts/mk/save-marketing-env.sh   (맥북에서 한 번만)
# 마케팅 분석 스크립트(scripts/mk/*.mjs)가 쓰는 ~/.config/pallo/marketing.env(권한 600)를 만든다.
# 서비스 키는 로그인된 Supabase CLI 로 'PALLO PLANNER' 프로젝트에서 받아 파일에만 쓴다. 키 값은 출력하지 않는다.
ref=aiqrchgwrfrmscstlsmv
mkdir -p ~/.config/pallo && umask 077
json="$(cd ~ && npx --yes --prefix ~/.cache/pallo-planner-dev supabase projects api-keys --project-ref $ref -o json 2>/dev/null)"
key="$(printf '%s' "$json" | python3 -c 'import json,sys; t=sys.stdin.read(); d=json.loads(t[min(i for i in (t.find("{"),t.find("[")) if i>=0):]); ks=d["keys"] if isinstance(d,dict) else d; print(next(k["api_key"] for k in ks if k.get("id")=="service_role"))' 2>/dev/null)"
if [[ ${#key} -lt 40 ]]; then echo "키를 못 받았어요. 'npx --prefix ~/.cache/pallo-planner-dev supabase login' 후 다시 실행하세요."; exit 1; fi
printf 'SUPABASE_URL=https://%s.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=%s\n' $ref "$key" > ~/.config/pallo/marketing.env
chmod 600 ~/.config/pallo/marketing.env
cd "$(dirname "$0")/../.." && node scripts/mk/teams.mjs >/dev/null && echo "OK: marketing.env 저장, 지점 목록 읽기 확인" || { echo "저장은 됐지만 DB 읽기 실패"; exit 1; }
