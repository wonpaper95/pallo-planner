#!/bin/bash
# 🧠 뇌 탭 분석 자료 모으기 (한 번에): 플래너 → 맥미니 Claude 대화 → 맥북에서 넘어온 대화 파일 → 한데 모으기
# 사용: bash scripts/brain/collect.sh [--since YYYY-MM-DD]     (--since: 그 날짜부터의 새 조각을 chunks/new.txt 로)
# 모은 것은 전부 맥미니 안(~/.local/share/pallo-brain)에만 둔다. 플래너 DB 는 읽기만 한다.
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR="${BRAIN_DIR:-$HOME/.local/share/pallo-brain}"
INBOX="${BRAIN_INBOX:-/Volumes/wonpaper308/pallo-brain}"   # 맥북이 동기화 폴더에 떨어뜨리는 곳
mkdir -p "$DIR" && chmod 700 "$DIR"
node scripts/brain/collect-planner.mjs
python3 scripts/brain/extract-claude.py --out "$DIR/claude-macmini.json"
# 맥북에서 온 파일(claude-<컴퓨터이름>.json)이 있으면 가져오고 동기화 폴더에서는 치운다 (없으면 지난번 것을 그대로 씀)
shopt -s nullglob
for f in "$INBOX"/claude-*.json; do
  if python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d.get("sessions"), list)' "$f" 2>/dev/null; then
    mv "$f" "$DIR/claude-macbook.json"; chmod 600 "$DIR/claude-macbook.json"; echo "맥북 대화 파일을 가져왔어요: $(basename "$f")"
  else echo "맥북 대화 파일이 아직 덜 넘어왔거나 깨졌어요 — 이번에는 건너뜀: $(basename "$f")" >&2; fi
done
[ -f "$DIR/claude-macbook.json" ] && echo "맥북 대화: $(python3 -c 'import json,sys,os,time; p=sys.argv[1]; d=json.load(open(p)); print(len(d["sessions"]), "개 대화 · 파일 날짜", time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(p))))' "$DIR/claude-macbook.json")" || echo "맥북 대화 파일 없음 (맥북에서 python3 ~/wonpaper308/pallo-brain/extract-claude.py 를 실행하면 생겨요)"
node scripts/brain/corpus.mjs --chunks "$@"
