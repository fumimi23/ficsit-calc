// issue #2: Docs パーサー — ゲーム同梱 Docs から data/recipes.json を生成する
// 受け入れ条件をそのまま約束テストとして固定する。
// fixture は実ゲームの Docs から切り出した縮小版(tests/fixtures/docs/、UTF-16LE + BOM の実形式。
// データポリシーにより説明文・フレーバーテキストは除去済み)。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { decodeDocs, parseDocs } from "../../src/lib/docs/parse-docs";

const read = (name: string) =>
	readFileSync(new URL(`../fixtures/docs/${name}`, import.meta.url));

const parseFixture = () =>
	parseDocs(decodeDocs(read("en-US.json")), decodeDocs(read("ja.json")));

describe("Docs パーサー(issue #2)", () => {
	it("UTF-16 の en-US.json を入力に実行したとき、スキーマ準拠の recipes.json 相当データが生成される(スキーマ検証を通る)", () => {
		const data = parseFixture();
		expect(() => validateRecipeData(data)).not.toThrow();
		// 空データがスキーマ検証をすり抜けていないことの確認
		expect(data.recipes.length).toBeGreaterThan(0);
		expect(Object.keys(data.items).length).toBeGreaterThan(0);
		expect(Object.keys(data.buildings).length).toBeGreaterThan(0);
	});

	it("生成物に「モジュラーフレーム」のデフォルトレシピが正しい入出力・機械・所要時間・電力で含まれる", () => {
		const data = parseFixture();

		const recipe = data.recipes.find((r) => r.id === "Recipe_ModularFrame_C");
		expect(recipe).toBeDefined();
		expect(recipe?.name).toBe("Modular Frame");
		expect(recipe?.nameJa).toBe("モジュラー・フレーム");
		expect(recipe?.building).toBe("Build_AssemblerMk1_C");
		expect(recipe?.durationSeconds).toBe(60);
		expect(recipe?.alternate).toBe(false);
		// 入力の並び順は約束しない(受け入れ条件は「正しい入出力」であって順序ではない)
		const byItem = (a: { item: string }, b: { item: string }) =>
			a.item < b.item ? -1 : 1;
		expect([...(recipe?.inputs ?? [])].sort(byItem)).toEqual([
			{ item: "Desc_IronPlateReinforced_C", amount: 3 },
			{ item: "Desc_IronRod_C", amount: 12 },
		]);
		expect(recipe?.outputs).toEqual([
			{ item: "Desc_ModularFrame_C", amount: 2 },
		]);

		// 電力は機械(組立機)側に持つ
		expect(data.buildings.Build_AssemblerMk1_C?.powerMW).toBe(15);
		expect(data.buildings.Build_AssemblerMk1_C?.nameJa).toBe("組立機");
	});

	// issue #12: 「代替レシピは既定で除外される」(issue #2)の意図された撤回。
	// レシピ選択(ロードマップ 3)の前提として alternate も収録し、フラグで区別する
	it("代替レシピが alternate: true で収録され、通常レシピと同じ入出力・機械・所要時間を持つ", () => {
		const data = parseFixture();

		const recipe = data.recipes.find(
			(r) => r.id === "Recipe_Alternate_Screw_C",
		);
		expect(recipe).toBeDefined();
		expect(recipe?.alternate).toBe(true);
		expect(recipe?.name).toBe("Alternate: Cast Screws");
		expect(recipe?.nameJa).toBe("代替: 鋳造ネジ");
		expect(recipe?.building).toBe("Build_ConstructorMk1_C");
		expect(recipe?.durationSeconds).toBe(24);
		expect(recipe?.inputs).toEqual([{ item: "Desc_IronIngot_C", amount: 5 }]);
		expect(recipe?.outputs).toEqual([{ item: "Desc_IronScrew_C", amount: 20 }]);
	});

	it("デフォルトレシピには alternate: true が立たない(表示名 Alternate: プレフィックスで判定)", () => {
		const data = parseFixture();
		const modularFrame = data.recipes.find(
			(r) => r.id === "Recipe_ModularFrame_C",
		);
		expect(modularFrame?.alternate).toBe(false);
	});

	it("手作業で作った建築物専用レシピ等、製造機械に紐づかないレシピは含まれない", () => {
		const data = parseFixture();
		// fixture には WorkBench(手作業)専用の Recipe_XenoZapper_C が含まれている
		expect(data.recipes.some((r) => r.id === "Recipe_XenoZapper_C")).toBe(
			false,
		);
		// 含まれるレシピの機械はすべてビルディング辞書に存在する
		for (const r of data.recipes) {
			expect(data.buildings[r.building]).toBeDefined();
		}
	});
});
