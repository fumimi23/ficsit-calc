#!/bin/sh
# マイルストーン単位のリリース(マイルストーン名 = タグ名)。
#   sh scripts/release.sh v0.1.0
#
# 発火を「マイルストーンの open issue が 0 になった瞬間」の自動トリガーにしないのは、
# 重複・取りやめでも issue は閉じるため。判定は機械に、発火は人の宣言に残す。
#
# exit code: 0 = リリースした / 1 = 前提不成立・残件あり / 2 = 実行環境の問題
set -e
cd "$(CDPATH= cd "$(dirname "$0")/.." && pwd)"

TAG="$1"
if [ -z "$TAG" ]; then
  echo "usage: sh scripts/release.sh <タグ>" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh が必要です" >&2
  exit 2
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "main で実行してください(現在のブランチ: $BRANCH)" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "作業ツリーに未コミットの変更があります" >&2
  exit 1
fi

git fetch origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "main が origin/main と一致していません(pull してから実行してください)" >&2
  exit 1
fi

MILESTONE_NUMBER="$(gh api "repos/{owner}/{repo}/milestones?state=all&per_page=100" \
  --jq "[.[] | select(.title == \"$TAG\")] | .[0].number")"
if [ -z "$MILESTONE_NUMBER" ] || [ "$MILESTONE_NUMBER" = "null" ]; then
  echo "マイルストーン $TAG がありません" >&2
  exit 1
fi

REMAINING="$(gh issue list --state open --milestone "$TAG" --limit 200 \
  --json number,title --jq '.[] | "  #\(.number) \(.title)"')"
if [ -n "$REMAINING" ]; then
  echo "マイルストーン $TAG に open の issue が残っています:" >&2
  echo "$REMAINING" >&2
  exit 1
fi

gh release create "$TAG" --target main --generate-notes
gh api -X PATCH "repos/{owner}/{repo}/milestones/$MILESTONE_NUMBER" \
  -f state=closed >/dev/null

echo "リリースしました: $(gh release view "$TAG" --json url --jq .url)"
