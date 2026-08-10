// issue #1: 計算コア — 目標アイテム＋レートから生産チェーンを逆算する
// 受け入れ条件をそのまま約束テストとして固定する。
// fixture は実ゲーム値を模す(tests/fixtures/recipes.ts):
//   鉄板: 構築機 6 秒 3 インゴット → 2 枚(20/分) / 鉄インゴット: 製錬炉 2 秒 1:1(30/分)
//   強化鉄板: 組立機 12 秒 鉄板 6 + ネジ 12 → 1(5/分)
import { describe, expect, it } from "vitest";
import { planProduction, UnknownItemError } from "../../src/lib/calc/plan";
import type { PlanNode } from "../../src/lib/calc/types";
import { fixtureData } from "../fixtures/recipes";

function collectLeaves(node: PlanNode): PlanNode[] {
	if (node.inputs.length === 0) return [node];
	return node.inputs.flatMap(collectLeaves);
}

describe("計算コア(issue #1)", () => {
	it("鉄板 30 個/分 を指定したとき、構築機 1.5 台・製錬炉 1.5 台(鉄インゴット 45/分)・鉄鉱石 45 個/分・合計電力 12MW(各 4MW × 3.0 台)が算出される", () => {
		const plan = planProduction(fixtureData, {
			itemId: "iron-plate",
			ratePerMinute: 30,
		});

		const plate = plan.machines.find((m) => m.recipeId === "iron-plate");
		const ingot = plan.machines.find((m) => m.recipeId === "iron-ingot");
		expect(plate?.building).toBe("constructor");
		expect(plate?.machineCount).toBeCloseTo(1.5);
		expect(ingot?.building).toBe("smelter");
		expect(ingot?.machineCount).toBeCloseTo(1.5);

		const ingotNode = plan.root.inputs.find((n) => n.item === "iron-ingot");
		expect(ingotNode?.ratePerMinute).toBeCloseTo(45);

		expect(plan.rawMaterials).toHaveLength(1);
		expect(plan.rawMaterials[0]?.item).toBe("iron-ore");
		expect(plan.rawMaterials[0]?.ratePerMinute).toBeCloseTo(45);

		expect(plan.totalPowerMW).toBeCloseTo(12);
	});

	it("複数原料レシピ(強化鉄板)を指定したとき、各原料の枝が再帰的に展開され、レシピを持たないアイテム(原料)のノードで終端する", () => {
		const plan = planProduction(fixtureData, {
			itemId: "reinforced-iron-plate",
			ratePerMinute: 5,
		});

		// 根の直下は鉄板とネジの 2 枝
		expect(plan.root.inputs.map((n) => n.item).sort()).toEqual([
			"iron-plate",
			"screw",
		]);

		// ネジの枝はロッドを経由して再帰的に展開される
		const screwNode = plan.root.inputs.find((n) => n.item === "screw");
		const rodNode = screwNode?.inputs.find((n) => n.item === "iron-rod");
		expect(rodNode).toBeDefined();
		expect(rodNode?.inputs.map((n) => n.item)).toEqual(["iron-ingot"]);

		// すべての葉はレシピを持たないアイテム(鉄鉱石)で、production を持たない
		const leaves = collectLeaves(plan.root);
		expect(leaves.length).toBeGreaterThan(0);
		for (const leaf of leaves) {
			expect(leaf.item).toBe("iron-ore");
			expect(leaf.production).toBeUndefined();
		}
	});

	it("同一中間素材が複数の枝から要求されるとき、素材・機械・電力の合計に重複なく合算される", () => {
		// 強化鉄板 5/分: 鉄インゴットは鉄板の枝(45/分)とネジ→ロッドの枝(15/分)の両方から要求される
		const plan = planProduction(fixtureData, {
			itemId: "reinforced-iron-plate",
			ratePerMinute: 5,
		});

		// 機械の合算はレシピ単位で 1 エントリ: 製錬炉 = (45 + 15) / 30 = 2.0 台
		const ingotEntries = plan.machines.filter(
			(m) => m.recipeId === "iron-ingot",
		);
		expect(ingotEntries).toHaveLength(1);
		expect(ingotEntries[0]?.machineCount).toBeCloseTo(2);

		// 原料の合算も 1 エントリ: 鉄鉱石 60/分
		expect(plan.rawMaterials).toHaveLength(1);
		expect(plan.rawMaterials[0]?.item).toBe("iron-ore");
		expect(plan.rawMaterials[0]?.ratePerMinute).toBeCloseTo(60);

		// 合計電力: 組立機 1.0×15 + 構築機(鉄板 1.5 + ネジ 1.5 + ロッド 1.0)×4 + 製錬炉 2.0×4 = 39MW
		expect(plan.totalPowerMW).toBeCloseTo(39);
	});

	it("存在しないアイテム ID を指定したとき、明示的なエラーになる", () => {
		expect(() =>
			planProduction(fixtureData, {
				itemId: "unobtainium",
				ratePerMinute: 10,
			}),
		).toThrow(UnknownItemError);
	});

	it("機械台数は小数のまま保持する(丸め・クロック提案は表示側の関心事)", () => {
		// 鉄板 10/分 → 構築機 0.5 台・製錬炉 0.5 台。整数への丸めが起きないことを固定する
		const plan = planProduction(fixtureData, {
			itemId: "iron-plate",
			ratePerMinute: 10,
		});

		const plate = plan.machines.find((m) => m.recipeId === "iron-plate");
		const ingot = plan.machines.find((m) => m.recipeId === "iron-ingot");
		expect(plate?.machineCount).toBeCloseTo(0.5);
		expect(ingot?.machineCount).toBeCloseTo(0.5);
		expect(plan.root.production?.machineCount).toBeCloseTo(0.5);
	});
});
