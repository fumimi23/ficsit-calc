// 横断不変条件: 個別機能ではなくデータセット全体を ∀ 検査する。
// validateRecipeData が検査する内容 =
//   スキーマ準拠 /
//   参照整合性(レシピの入出力アイテムと発電機の燃料・副資材はアイテム辞書に、
//     レシピの機械はビルディング辞書に存在) /
//   正の値(電力・定格出力・所要時間・数量・エネルギー値・副資材比率) /
//   ID の一意性(レシピ・発電機) / 発電機は燃料を 1 つ以上持つ。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { fixtureData } from "../fixtures/recipes";

describe("invariants: レシピデータ", () => {
	it("コミット済み data/recipes.json はスキーマ準拠である", () => {
		expect(() => validateRecipeData(recipesJson)).not.toThrow();
	});

	it("計算コアのテスト fixture もスキーマ準拠である", () => {
		expect(() => validateRecipeData(fixtureData)).not.toThrow();
	});

	// issue #20: 総電力から必要発電機を出すには、スナップショットに発電機が要る。
	// 地熱は出力が立地依存なので収録対象外(id を数え上げず「含む」で確かめる)
	it("コミット済み data/recipes.json に発電機(石炭・燃料式・原子力)が収録されている", () => {
		const data = validateRecipeData(recipesJson);
		const ids = data.generators.map((g) => g.id);

		expect(ids).toContain("Build_GeneratorCoal_C");
		expect(ids).toContain("Build_GeneratorFuel_C");
		expect(ids).toContain("Build_GeneratorNuclear_C");
		expect(ids).not.toContain("Build_GeneratorGeoThermal_C");
	});
});
