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

# open に限定するのは、close 済みの版に再実行すると残件 0 のゲートを素通りしてしまうため。
# close だけ失敗した回はマイルストーンが open のまま残るので、復旧の再実行はここを通る。
# --paginate と --jq の併用では jq フィルタがページごとに適用されて出力が連結されるので、
# 1 行 1 件で出して先頭を取る。パイプで直接受けると set -e が gh の失敗を拾えなくなるため代入を分ける。
# タグ名は env 経由で渡す。jq のソースへ連結すると、引用符を含む名前で構文エラーになる。
MILESTONE_ROWS="$(TAG="$TAG" gh api --paginate \
  "repos/{owner}/{repo}/milestones?state=open&per_page=100" \
  --jq '.[] | select(.title == env.TAG) | "\(.number) \(.open_issues) \(.closed_issues)"')"
MILESTONE_ROW="$(printf '%s\n' "$MILESTONE_ROWS" | head -n 1)"
if [ -z "$MILESTONE_ROW" ]; then
  echo "open のマイルストーン $TAG がありません(未作成か、既に close 済み)" >&2
  exit 1
fi
set -- $MILESTONE_ROW
MILESTONE_NUMBER="$1"
MILESTONE_OPEN="$2"
MILESTONE_CLOSED="$3"

REMAINING="$(gh issue list --state open --milestone "$TAG" --limit 200 \
  --json number,title --jq '.[] | "  #\(.number) \(.title)"')"
if [ -n "$REMAINING" ]; then
  echo "マイルストーン $TAG に open の issue が残っています:" >&2
  echo "$REMAINING" >&2
  exit 1
fi

# REST の open 件数はマイルストーンを付けた open PR も数える。gh issue list は PR を含めないので、
# 未マージ PR だけが残る版はここでしか止められない。
# if の条件に置いたコマンドには set -e が効かないため、非数値で [ が落ちても素通りする。
# ! で受けると [ の失敗(終了コード 2)が真になり、中止側に倒れる。
if ! [ "$MILESTONE_OPEN" -eq 0 ] 2>/dev/null; then
  echo "マイルストーン $TAG の open 件数が 0 ではありません(値: $MILESTONE_OPEN)。" >&2
  echo "issue 一覧は空なので、マイルストーンを付けた open の PR が残っているとみられます。" >&2
  exit 1
fi

# 作ったばかりで issue を 1 件も紐付けていないマイルストーンは残件 0 の検査を素通りするので、
# 中身のない版を切らないようここで止める。
if ! [ "$MILESTONE_CLOSED" -gt 0 ] 2>/dev/null; then
  echo "マイルストーン $TAG に closed の issue がありません(値: $MILESTONE_CLOSED)。" >&2
  echo "中身のない版は切らない。" >&2
  exit 1
fi

# close だけ失敗した回の再実行を通すため。作成をやり直すと tag already exists で落ち、
# マイルストーンが open のまま取り残される。
CREATED=""
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG は既にあります。マイルストーンの close だけ行います。" >&2
else
  gh release create "$TAG" --target main --generate-notes
  CREATED="yes"
fi
gh api -X PATCH "repos/{owner}/{repo}/milestones/$MILESTONE_NUMBER" \
  -f state=closed >/dev/null

RELEASE_URL="$(gh release view "$TAG" --json url --jq .url)"
if [ -n "$CREATED" ]; then
  echo "リリースしました: $RELEASE_URL"
else
  echo "マイルストーン $TAG を close しました(Release は作成済みのものを使いました): $RELEASE_URL"
fi
