#!/usr/bin/env python3
# 🧠 뇌 탭 분석 자료 모으기 ② Claude 대화
# 이 컴퓨터의 Claude Code 대화 기록(~/.claude/projects)에서 "내가 직접 쓴 말"과 "질문에 고른 답"만 뽑아 파일 하나로 만든다.
# Claude 의 답·도구 출력·파일 내용은 담지 않는다. 아무것도 고치거나 지우지 않고, 인터넷으로 보내지도 않는다.
#
# 사용:  python3 extract-claude.py            → 이 파일 옆에 claude-<컴퓨터이름>.json 을 만든다
#        python3 extract-claude.py --out 경로  → 그 경로에 만든다
import glob, hashlib, json, os, re, subprocess, sys

ROOT = os.path.expanduser("~/.claude/projects")
SKIP_BLOCK = ("<system-reminder", "<local-command", "<command-name", "<command-message", "<bash-input", "<bash-stdout", "<task-notification", "<side-sessions-event", "<ci-monitor-event")
SKIP_TEXT = ("This session is being continued", "[Request interrupted", "Caveat:", "The user hasn't heard from you")
ANSWER = ("Your questions have been answered", "User has answered your questions")
MAX = 3000


def host():
    try:
        n = subprocess.run(["scutil", "--get", "ComputerName"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        n = ""
    if not n:
        import socket
        n = socket.gethostname()
    return re.sub(r"[^0-9A-Za-z가-힣]+", "-", n).strip("-") or "mac"


def typed(content):
    """사용자 메시지에서 직접 쓴 글만. (종류, 글) 또는 None"""
    if isinstance(content, str):
        parts = [content]
    elif isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_result":
                c = x.get("content")
                if isinstance(c, list):
                    c = " ".join(y.get("text", "") for y in c if isinstance(y, dict))
                if isinstance(c, str) and c.lstrip().startswith(ANSWER):
                    return ("answer", c.strip())
                return None
        parts = [x.get("text", "") for x in content if isinstance(x, dict) and x.get("type") == "text"]
    else:
        return None
    keep = [p.strip() for p in parts if p and p.strip() and not p.lstrip().startswith(SKIP_BLOCK)]
    text = "\n".join(keep).strip()
    text = re.sub(r"<system-reminder>.*?</system-reminder>", "", text, flags=re.S).strip()
    if not text or text.startswith(SKIP_TEXT) or text.startswith("<"):
        return None
    return ("say", text)


def main():
    out = None
    if "--out" in sys.argv:
        out = os.path.expanduser(sys.argv[sys.argv.index("--out") + 1])
    name = host()
    if not out:
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"claude-{name}.json")
    seen, sessions, n_msg = {}, [], 0
    files = sorted(glob.glob(os.path.join(ROOT, "*", "*.jsonl")), key=os.path.getmtime)
    for f in files:
        msgs, title = [], ""
        try:
            with open(f, errors="ignore") as fh:
                for line in fh:
                    if '"type":"user"' not in line and '"summary"' not in line and "-title" not in line:
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    t = o.get("type")
                    if t == "summary" and o.get("summary"):
                        title = title or str(o["summary"])[:120]
                    elif t in ("custom-title", "ai-title"):
                        title = str(o.get("customTitle") or o.get("aiTitle") or o.get("title") or title)[:120]
                    if t != "user" or o.get("isSidechain") or o.get("isMeta"):
                        continue
                    got = typed((o.get("message") or {}).get("content"))
                    if not got:
                        continue
                    kind, text = got
                    key = hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()
                    if key in seen:  # 예약 작업처럼 같은 글이 되풀이되면 한 번만 담고 횟수만 센다
                        seen[key]["n"] = seen[key].get("n", 1) + 1
                        continue
                    m = {"t": (o.get("timestamp") or "")[:16], "kind": kind, "text": text[:MAX]}
                    if len(text) > MAX:
                        m["cut"] = len(text)
                    seen[key] = m
                    msgs.append(m)
        except Exception:
            continue
        if msgs:
            n_msg += len(msgs)
            sessions.append({"id": os.path.basename(f)[:8], "project": os.path.basename(os.path.dirname(f)), "start": msgs[0]["t"], "title": title, "msgs": msgs})
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"host": name, "sessions": sessions}, fh, ensure_ascii=False)
    try:
        os.chmod(out, 0o600)
    except Exception:
        pass
    print(f"끝! 대화 {len(sessions)}개에서 내가 쓴 말 {n_msg}개를 뽑았어요 → {out}")


if __name__ == "__main__":
    main()
