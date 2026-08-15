// issue #2: Docs パーサー — ゲーム同梱 Docs から data/recipes.json を生成する
// 受け入れ条件をそのまま約束テストとして固定する。
// fixture は実ゲームの Docs から切り出した縮小版(tests/fixtures/docs/、UTF-16LE + BOM の実形式。
// データポリシーにより説明文・フレーバーテキストは除去済み)。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import type { ExactNumeric } from "../../src/lib/calc/types";
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

// issue #20: 必要発電機リスト — 総電力から必要台数・必要燃料を出すために、
// Docs から発電機(定格出力・燃焼できる燃料・副資材)も収録する。
describe("Docs パーサー: 発電機の収録(issue #20)", () => {
	// ExactNumeric の表現(number / 十進文字列)は約束しないので、値は Fraction で比べる
	const expectValue = (actual: ExactNumeric | undefined, expected: string) => {
		expect(
			actual === undefined ? undefined : Fraction.from(actual).toString(),
		).toBe(Fraction.from(expected).toString());
	};

	it("石炭発電機が定格 75MW・石炭燃料(300MJ)・水の副資材(0.01 m³/MJ)付きで収録される", () => {
		const data = parseFixture();

		const coal = data.generators.find((g) => g.id === "Build_GeneratorCoal_C");
		expect(coal).toBeDefined();
		expect(coal?.name).toBe("Coal-Powered Generator");
		expect(coal?.nameJa).toBe("石炭発電機");
		expectValue(coal?.powerMW, "75");
		expect(coal?.fuels).toHaveLength(1);
		expect(coal?.fuels[0]?.item).toBe("Desc_Coal_C");
		expectValue(coal?.fuels[0]?.energyMJ, "300");
		expect(coal?.fuels[0]?.supplemental?.item).toBe("Desc_Water_C");
		// Docs の mSupplementalToPowerRatio は L/MJ。数量と同じく m³ 基準に直す
		expectValue(coal?.fuels[0]?.supplemental?.amountPerMJ, "0.01");
	});

	it("液体燃料のエネルギー値は MJ/L から MJ/m³ に換算される(0.75 → 750)", () => {
		const data = parseFixture();

		const fuel = data.generators.find((g) => g.id === "Build_GeneratorFuel_C");
		expectValue(fuel?.powerMW, "250");
		expect(fuel?.fuels[0]?.item).toBe("Desc_LiquidFuel_C");
		expectValue(fuel?.fuels[0]?.energyMJ, "750");
		// 副資材を要求しない発電機には supplemental が付かない
		expect(fuel?.fuels[0]?.supplemental).toBeUndefined();
	});

	it("原子力発電所が定格 2500MW・ウラン燃料棒(750000MJ)・水の副資材(0.0016 m³/MJ)付きで収録される", () => {
		// 燃料式とは別の NativeClass(FGBuildableGeneratorNuclear)から拾う経路を通す
		const data = parseFixture();

		const nuclear = data.generators.find(
			(g) => g.id === "Build_GeneratorNuclear_C",
		);
		expect(nuclear).toBeDefined();
		expect(nuclear?.name).toBe("Nuclear Power Plant");
		expect(nuclear?.nameJa).toBe("原子力発電所");
		expectValue(nuclear?.powerMW, "2500");
		// 固体燃料なので m³ 換算(×1000)は掛からない
		expect(nuclear?.fuels[0]?.item).toBe("Desc_NuclearFuelRod_C");
		expectValue(nuclear?.fuels[0]?.energyMJ, "750000");
		expect(nuclear?.fuels[0]?.supplemental?.item).toBe("Desc_Water_C");
		// 1.6 L/MJ ÷ 1000 = 0.0016 m³/MJ(2500MW で水 240 m³/分 = ゲーム内の既知値)
		expectValue(nuclear?.fuels[0]?.supplemental?.amountPerMJ, "0.0016");
	});

	it("発電機の燃料・副資材のアイテムがアイテム辞書に収録される", () => {
		// レシピからしか items を作らないと、燃料アイテムの表示名が引けず参照整合性も壊れる
		const data = parseFixture();

		for (const id of ["Desc_Coal_C", "Desc_Water_C", "Desc_LiquidFuel_C"]) {
			expect(data.items[id]).toBeDefined();
		}
		expect(data.items.Desc_Coal_C?.name).toBe("Coal");
		expect(data.items.Desc_Water_C?.form).toBe("liquid");
	});
});
