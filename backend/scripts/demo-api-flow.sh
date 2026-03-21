#!/usr/bin/env bash
# Full API flow for demos: health → create session → 2 progressive screenshots → GET session + evaluations.
# Prereq: server running (e.g. npm run dev in another terminal).
# Usage: ./scripts/demo-api-flow.sh [path-to-image.png]
set -euo pipefail

BASE="${API_BASE:-http://localhost:3001}"
IMG="${1:-$(dirname "$0")/../test.png}"

pretty() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

session_id_from_json() {
  local raw="$1"
  if command -v jq >/dev/null 2>&1; then
    echo "$raw" | jq -r '.sessionId // empty'
    return
  fi
  python3 -c "import json,sys; print(json.loads(sys.stdin.read())['sessionId'])" <<<"$raw"
}

echo "=== 1) POST /health ==="
curl -sS -X POST "$BASE/health" | pretty

echo
echo "=== 2) POST /api/sessions (initial screenshot → sourceOfTruth) ==="
CREATE_JSON=$(curl -sS -X POST "$BASE/api/sessions" \
  -F "image=@$IMG" \
  -F "studentId=demo-student" \
  -F "classId=demo-class")
echo "$CREATE_JSON" | pretty

SID=$(session_id_from_json "$CREATE_JSON")
if [[ -z "${SID:-}" ]]; then
  echo "Failed to read sessionId from response. Is the server running at $BASE?" >&2
  exit 1
fi

echo
echo "=== 3) POST /api/sessions/$SID/screenshots (first progress check) ==="
curl -sS -X POST "$BASE/api/sessions/$SID/screenshots" -F "image=@$IMG" | pretty

echo
echo "=== 4) POST /api/sessions/$SID/screenshots (second progress check) ==="
curl -sS -X POST "$BASE/api/sessions/$SID/screenshots" -F "image=@$IMG" | pretty

echo
echo "=== 5) GET /api/sessions/$SID ==="
curl -sS "$BASE/api/sessions/$SID" | pretty

echo
echo "=== 6) GET /api/sessions/$SID/evaluations ==="
curl -sS "$BASE/api/sessions/$SID/evaluations" | pretty

echo
echo "Done. sessionId=$SID"
