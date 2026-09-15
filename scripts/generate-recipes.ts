// data/recipes.json をゲーム同梱 Docs から生成する。
//   使い方: npm run generate-recipes -- "<Docs ディレクトリ>"
//   例:     npm run generate-recipes -- "/mnt/e/Epic Games/Satisfactory/CommunityResources/Docs"
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateRecipeData } from "../src/lib/calc/validate";
import { decodeDocs, parseDocs } from "../src/lib/docs/parse-docs";

const docsDir = process.argv[2];
if (!docsDir) {
	console.error('使い方: npm run generate-recipes -- "<Docs ディレクトリ>"');
	console.error(
		'例:     npm run generate-recipes -- "/mnt/e/Epic Games/Satisfactory/CommunityResources/Docs"',
	);
	process.exit(1);
}

const en = decodeDocs(readFileSync(join(docsDir, "en-US.json")));
const ja = decodeDocs(readFileSync(join(docsDir, "ja.json")));
// 生成直後にも検証する(壊れたスナップショットのコミットを invariants 実行前に止める)
const data = validateRecipeData(parseDocs(en, ja));

mkdirSync("data", { recursive: true });
const outPath = join("data", "recipes.json");
writeFileSync(outPath, `${JSON.stringify(data, null, "\t")}\n`);
// JSON.stringify の整形は biome と一致しない(1 要素の配列を 1 行に畳まない)ので、
// 書き出した直後に biome を通す。整形せずにコミットすると `biome ci` が落ちる。
// npm script 側に `&&` で足さないのは、`npm run generate-recipes -- "<Docs>"` の
// 引数が末尾のコマンドに付いてしまうため。
execFileSync("npx", ["biome", "format", "--write", outPath], {
	stdio: "inherit",
});
console.log(
	`${outPath} を生成しました: items ${Object.keys(data.items).length} / buildings ${Object.keys(data.buildings).length} / recipes ${data.recipes.length} / generators ${data.generators.length}`,
);
