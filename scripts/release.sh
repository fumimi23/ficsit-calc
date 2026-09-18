#!/bin/sh
# マイルストーン単位のリリース(マイルストーン名 = タグ名)。
#   sh scripts/release.sh v0.1.0
#
# 発火を「マイルストーンの open issue が 0 になった瞬間」の自動トリガーにしないのは、
# 重複・取りやめでも issue は閉じるため。判定は機械に、発火は人の宣言に残す。
#
# exit code: 0 = リリースした / 2 = gh が無い / 1 = 前提不成立・残件あり。
# set -e で落ちる git・gh の失敗はそのコマンド自身の終了コード(多くは 1)で終わる。
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

# --paginate と --jq の併用では jq フィルタがページごとに適用されて出力が連結されるので、
# 1 行 1 件で出して先頭を取る。パイプで直接受けると set -e が gh の失敗を拾えなくなるため代入を分ける。
MILESTONE_NUMBERS="$(gh api --paginate "repos/{owner}/{repo}/milestones?state=all&per_page=100" \
  --jq ".[] | select(.title == \"$TAG\") | .number")"
MILESTONE_NUMBER="$(printf '%s\n' "$MILESTONE_NUMBERS" | head -n 1)"
if [ -z "$MILESTONE_NUMBER" ]; then
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

# close だけ失敗した回の再実行を通すため。作成をやり直すと tag already exists で落ち、
# マイルストーンが open のまま取り残される。
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG は既にあります。マイルストーンの close だけ行います。" >&2
else
  gh release create "$TAG" --target main --generate-notes
fi
gh api -X PATCH "repos/{owner}/{repo}/milestones/$MILESTONE_NUMBER" \
  -f state=closed >/dev/null

echo "リリースしました: $(gh release view "$TAG" --json url --jq .url)"
