// issue #5: デフォルトレシピ解決 — 実データ(data/recipes.json)に対する約束。
// primary 選択規則の適用結果(燃料・容器入り燃料)、候補が無いアイテムの原料終端、
// 副産物の byproducts 集計(需要と相殺しない)を固定する。
// 選択規則そのものの固定は recipe-selection.test.ts。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { Fraction } from "../../src/lib/calc/fraction";
import { planProduction } from "../../src/lib/calc/plan";
import { validateRecipeData } from "../../src/lib/calc/validate";

const data = validateRecipeData(recipesJson);
const frac = (num: number, den = 1) => Fraction.of(num, den);

describe("デフォルトレシピ解決(issue #5)", () => {
	it("燃料を目標に指定したとき、精製機の「燃料」レシピが使われる(開封レシピは使われない)", () => {
		const plan = planProduction(data, {
			itemId: "Desc_LiquidFuel_C",
			ratePerMinute: 40,
		});

		expect(plan.root.production?.recipeId).toBe("Recipe_LiquidFuel_C");
		expect(plan.root.production?.building).toBe("Build_OilRefinery_C");
		expect(plan.machines.map((m) => m.recipeId)).not.toContain(
			"Recipe_UnpackageFuel_C",
		);
	});

	it("容器入り燃料を目標に指定したとき、充填 → 燃料(精製機)・空の容器(構築機)と展開され、循環エラーにならない", () => {
		const plan = planProduction(data, {
			itemId: "Desc_Fuel_C",
			ratePerMinute: 60,
		});

		expect(plan.root.production?.recipeId).toBe("Recipe_Fuel_C");
		const fuelNode = plan.root.inputs.find(
			(n) => n.item === "Desc_LiquidFuel_C",
		);
		const canisterNode = plan.root.inputs.find(
			(n) => n.item === "Desc_FluidCanister_C",
		);
		expect(fuelNode?.production?.recipeId).toBe("Recipe_LiquidFuel_C");
		expect(canisterNode?.production?.recipeId).toBe("Recipe_FluidCanister_C");
	});

	it("primary 選択で候補が無いアイテム(廃重油 = 副産物・開封・代替のみ、圧縮石炭 = 副産物・代替のみ)は原料ノードとして終端する", () => {
		for (const itemId of ["Desc_HeavyOilResidue_C", "Desc_CompactedCoal_C"]) {
			const plan = planProduction(data, { itemId, ratePerMinute: 30 });
			expect(plan.root.production).toBeUndefined();
			expect(plan.machines).toEqual([]);
			expect(plan.rawMaterials).toEqual([
				{ item: itemId, ratePerMinute: frac(30) },
			]);
		}
	});

	it("プラスチック 20 個/分 を指定したとき、廃重油 10 個/分 が余剰(byproducts)として計上される", () => {
		const plan = planProduction(data, {
			itemId: "Desc_Plastic_C",
			ratePerMinute: 20,
		});

		// 名前一致(c)で Recipe_Plastic_C(原油 3 → プラスチック 2 + 廃重油 1)が選ばれる
		expect(plan.root.production?.recipeId).toBe("Recipe_Plastic_C");
		expect(plan.byproducts).toEqual([
			{ item: "Desc_HeavyOilResidue_C", ratePerMinute: frac(10) },
		]);
		expect(plan.rawMaterials).toEqual([
			{ item: "Desc_LiquidOil_C", ratePerMinute: frac(30) },
		]);
	});

	it("チェーンが原料として要求するアイテムが副産物にも出るとき(ロケット燃料の圧縮石炭)、需要と相殺されない", () => {
		// ロケット燃料 100/分: ターボ燃料の原料として圧縮石炭 48/分 を要求しつつ、
		// ロケット燃料レシピ自身が圧縮石炭 10/分 を副産物として産出する。両者は別々に全量計上される
		const plan = planProduction(data, {
			itemId: "Desc_RocketFuel_C",
			ratePerMinute: 100,
		});

		const coalRaw = plan.rawMaterials.find(
			(m) => m.item === "Desc_CompactedCoal_C",
		);
		expect(coalRaw?.ratePerMinute).toEqual(frac(48));

		const coalByproduct = plan.byproducts.find(
			(b) => b.item === "Desc_CompactedCoal_C",
		);
		expect(coalByproduct?.ratePerMinute).toEqual(frac(10));
	});
});
