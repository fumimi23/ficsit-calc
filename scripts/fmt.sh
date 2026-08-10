#!/bin/sh
# 整形とセーフな lint 修正を「適用」する。CI(check.sh)は差分検出のみで、適用はこちら。
set -e
cd "$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
npx biome check --write .
