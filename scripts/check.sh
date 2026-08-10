#!/bin/sh
# ローカル CI: GitHub Actions の代わりにローカルで回す一連のチェック。
#   手動:     sh scripts/check.sh
#   push 前: .githooks/pre-push から自動実行(有効化は README 参照)
#
# 新しいチェックを足すときはこのファイルに追記する(CI の単一の入口)。
set -e
cd "$(CDPATH= cd "$(dirname "$0")/.." && pwd)"

# 採用した lint / format チェックをここに置く(作成時に候補から選んだものを埋める)。
# CI では整形を「適用」せず「差分があれば失敗」させる(--check / ci 系)。整形の適用は scripts/fmt.sh。
echo "[check] lint / format (biome)"
npx biome ci .

echo "[check] typecheck (astro check)"
npx astro check

# テストは 3 層(spec=約束の台帳 / unit=実装都合 / invariants=横断不変条件)。
# vitest.config.ts の include が tests/ 配下 3 層すべてを拾う(invariants を除外しない)。
echo "[check] tests (vitest)"
npx vitest run --passWithNoTests

echo "[check] すべて OK"
