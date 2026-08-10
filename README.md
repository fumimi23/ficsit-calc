# ficsit-calc

Satisfactory の生産チェーン計算機（**非公式ツール**）。作りたいアイテムと目標生産数（個/分）を入力すると、必要な**機械の種類と台数**・**中間素材と原料の必要量（個/分）**・**合計消費電力（MW）**を逆算して表示する Web アプリ。

- 計算はすべてクライアント側の純粋な処理（サーバー API なし）。静的サイトとして GitHub Pages で公開予定
- v1 はデフォルトレシピのみ対応。代替レシピ・オーバークロック・採掘機/資源純度はロードマップ扱い（経緯と全体像は [docs/kickoff.md](docs/kickoff.md)）

## データの出典と取り扱い

- レシピデータは、ゲーム同梱でツール開発用に提供されているデータ（`CommunityResources/Docs/` のロケール別 JSON、Coffee Stain Studios 提供）から自前パーサーで抽出した派生スナップショット `data/recipes.json` です（表示名は `en-US.json` と `ja.json` から日英両方を収録）
- 本ツールは Coffee Stain Studios とは無関係の非公式ツールです
- 生の Docs ファイルはリポジトリにコミットしません（`.gitignore` 済み）。抽出は計算に必要な最小限（ID・名前・数量・所要時間・機械・電力・物質形態）に留め、説明文・フレーバーテキスト・画像アセットは含めません
- v1 の収録範囲: デフォルトレシピのみ（代替レシピは除外）。可変電力の機械（粒子加速器・コンバーター・量子エンコーダー）とそのレシピは、機械単位の定格電力で表せないため v1 では除外しています

## 技術スタック

- Astro + React アイランド + TypeScript（静的ビルド）。計算コアはフレームワーク非依存の純 TS モジュール
- 計算コアの数値は BigInt ベースの分数（`src/lib/calc/fraction.ts`）で保持し、浮動小数点誤差なしで計算する（表示時に十進文字列化）
- テスト: Vitest / lint + format: Biome

## 開発

Node は `.node-version`（nodenv）でピン留め。依存はプロジェクトローカル（`node_modules`）に閉じる。

```sh
npm install
npm run dev    # http://localhost:5273/ficsit-calc （ポートは 5273 固定）
npm run build  # dist/ に静的ビルド
```

### レシピデータの再生成

`data/recipes.json` はコミット済みなので通常は不要。ゲームのアップデート後に更新する場合:

```sh
npm run generate-recipes -- "/mnt/e/Epic Games/Satisfactory/CommunityResources/Docs"
```

引数はゲームフォルダの `CommunityResources/Docs` ディレクトリ（`en-US.json` と `ja.json` を直接読む）。WSL からは Windows のドライブが `/mnt/<ドライブ文字>/` に見える。

## ローカル CI

GitHub Actions は使わず、push 前にローカルでチェックを回す。

- 有効化（クローンごとに一度）: `git config core.hooksPath .githooks`
- 手動実行: `sh scripts/check.sh`（Biome → `astro check` → Vitest の順）
- 緊急時のバイパス: `git push --no-verify`

lint / format は **Biome**。整形の適用は `sh scripts/fmt.sh`（check.sh 側は差分があれば失敗する検出のみ）。

注意: `astro check` は TypeScript 6.x が必要（7.x のネイティブコンパイラは対応 API 未搭載のため devDependencies で 6.x にピン留めしている）。

## テスト

テストは 3 層に分ける（**テスト = 仕様の台帳**）:

- `tests/spec/` — 約束の台帳。振る舞い・契約レベルで書き、対応 issue 番号をコメントで併記する。ここにある挙動 = 約束、それ以外 = 偶然の挙動（変更自由）
- `tests/unit/` — 実装都合のテスト。設計のための足場で、自由に変更・削除してよい
- `tests/invariants/` — 横断不変条件（例: recipes.json はスキーマ準拠 / 全レシピの入出力アイテムはアイテム辞書に存在する）

## ライセンス

コードは [MIT](LICENSE)。抽出元ゲームデータの権利は Coffee Stain Studios に帰属します。
