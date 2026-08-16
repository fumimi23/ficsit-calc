// 横断不変条件: 個別機能ではなくデータセット全体を ∀ 検査する。
// validateRecipeData が検査する内容 =
//   スキーマ準拠 /
//   参照整合性(レシピの入出力アイテムと発電機の燃料・副資材、採取設備の対象資源は
//     アイテム辞書に、レシピの機械はビルディング辞書に存在) /
//   正の値(電力・定格出力・所要時間・数量・エネルギー値・副資材比率・採取レート) /
//   ID の一意性(レシピ・発電機・採取設備) /
//   発電機は燃料を、採取設備は対象資源を 1 つ以上持つ。
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

	// issue #23: 原料の採取を計画に含めるには、スナップショットに採取設備が要る。
	// 資源井(加圧機 + サテライト)はレートが立地依存なので収録対象外
	it("コミット済み data/recipes.json に採取設備(揚水ポンプ・原油抽出機・採鉱機 Mk.1〜3)が収録されている", () => {
		const data = validateRecipeData(recipesJson);
		const ids = data.extractors.map((e) => e.id);

		expect(ids).toContain("Build_WaterPump_C");
		expect(ids).toContain("Build_OilPump_C");
		expect(ids).toContain("Build_MinerMk1_C");
		expect(ids).toContain("Build_MinerMk2_C");
		expect(ids).toContain("Build_MinerMk3_C");
		expect(ids).not.toContain("Build_FrackingExtractor_C");
		expect(ids).not.toContain("Build_FrackingSmasher_C");

		// 対象資源が正しく引けていないと、水を要求する計画に揚水ポンプが出ない
		const waterPump = data.extractors.find((e) => e.id === "Build_WaterPump_C");
		expect(waterPump?.resources).toContain("Desc_Water_C");
	});

	// issue #21: 1 機種でも建設素材が欠けると建設コストが黙って過少表示になる。
	// 参照整合性と正の数量は validateRecipeData 側(上の 1 本目)が全件を見る
	it("コミット済み data/recipes.json の全機械・全発電機が建設素材を持つ", () => {
		const data = validateRecipeData(recipesJson);
		const costs = [
			...Object.entries(data.buildings).map(([id, building]) => ({
				id,
				cost: building.constructionCost,
			})),
			...data.generators.map((g) => ({ id: g.id, cost: g.constructionCost })),
		];

		expect(costs.length).toBeGreaterThan(0);
		for (const { id, cost } of costs) {
			expect(cost, id).toBeDefined();
			expect(cost?.length ?? 0, id).toBeGreaterThan(0);
		}
	});
});
