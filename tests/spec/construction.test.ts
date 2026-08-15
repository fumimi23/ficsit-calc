// issue #21: 建設コスト計算 — 建設台数(レシピ単位の切り上げ)× 機械の建設素材を
// アイテム別に合算する純関数の約束を固定する。
// 建設台数の解釈(レシピ単位で ceil してから合算)は issue #21 で決めた仕様なので、
// 「合算してから ceil」と結果が変わる値で固定する。
import { describe, expect, it } from "vitest";
import type { ItemQuantity } from "../../src/lib/calc/construction";
import {
	generatorConstructionCost,
	sumMachineConstructionCost,
} from "../../src/lib/calc/construction";
import { Fraction } from "../../src/lib/calc/fraction";
import { planGenerators } from "../../src/lib/calc/generators";
import type { MachineRequirement, RecipeData } from "../../src/lib/calc/types";
import { fixtureData, generatorFixtureData } from "../fixtures/recipes";

// 返り値の並び順は約束しないのでアイテム別の辞書に畳む。
// 数量は既約分数の文字列で突き合わせる(Fraction の内部表現を約束しないため)
const byItem = (quantities: ItemQuantity[]): Record<string, string> =>
	Object.fromEntries(quantities.map((q) => [q.item, q.amount.toString()]));

/** 建設コストは building と machineCount しか見ないので、電力は 0 で埋める */
const machine = (
	recipeId: string,
	building: string,
	machineCount: string,
): MachineRequirement => ({
	recipeId,
	building,
	machineCount: Fraction.from(machineCount),
	powerMW: Fraction.of(0),
});

const requirementFor = (
	data: RecipeData,
	totalPowerMW: string,
	generator: string,
) => {
	const requirement = planGenerators(data, Fraction.from(totalPowerMW)).find(
		(r) => r.generator === generator,
	);
	if (!requirement) throw new Error(`発電機がありません: ${generator}`);
	return requirement;
};

describe("機械の建設コスト(issue #21)", () => {
	it("機械台数が端数のとき、レシピ単位で切り上げた台数分のコストになる", () => {
		// 構築機 1.5 台 → 建設 2 台 = 強化鉄板 2×2、鉄のロッド 8×2
		const cost = sumMachineConstructionCost(fixtureData, [
			machine("iron-plate", "constructor", "1.5"),
		]);

		expect(byItem(cost)).toEqual({
			"reinforced-iron-plate": "4",
			"iron-rod": "16",
		});
	});

	it("同一機械を使う複数レシピでは、レシピ単位の切り上げ台数の合計で計算される", () => {
		// 0.5 台 + 0.5 台 は「合算してから切り上げ」なら 1 台分(強化鉄板 2)だが、
		// 別々の設備なので 1 台 + 1 台 = 2 台分建てる必要がある
		const cost = sumMachineConstructionCost(fixtureData, [
			machine("iron-plate", "constructor", "0.5"),
			machine("iron-rod", "constructor", "0.5"),
		]);

		expect(byItem(cost)).toEqual({
			"reinforced-iron-plate": "4",
			"iron-rod": "16",
		});
	});

	it("複数種類の機械が同じ素材を使うとき、アイテム別に合算される", () => {
		// 構築機 1 台(鉄のロッド 8)+ 製錬炉 1 台(鉄のロッド 5)= 1 エントリの 13
		const cost = sumMachineConstructionCost(fixtureData, [
			machine("iron-plate", "constructor", "1"),
			machine("iron-ingot", "smelter", "1"),
		]);

		expect(byItem(cost)).toEqual({
			"reinforced-iron-plate": "2",
			"iron-rod": "13",
		});
	});

	it("machines が空のとき、空配列を返す", () => {
		expect(sumMachineConstructionCost(fixtureData, [])).toEqual([]);
	});

	it("building がビルディング辞書に無いとき、Error になる", () => {
		// 黙って 0 個として飛ばすと建設コストが過少表示になる
		expect(() =>
			sumMachineConstructionCost(fixtureData, [
				machine("unknown", "particle-accelerator", "1"),
			]),
		).toThrow();
	});
});

describe("発電機の建設コスト(issue #21)", () => {
	it("発電機の建設コストは必要台数 × 素材になる", () => {
		// 総電力 300MW → 石炭発電機 4 台 = 強化鉄板 20×4、鉄のロッド 10×4
		const coal = requirementFor(generatorFixtureData, "300", "coal-generator");
		expect(coal.count).toBe(4n);

		expect(
			byItem(generatorConstructionCost(generatorFixtureData, coal)),
		).toEqual({ "reinforced-iron-plate": "80", "iron-rod": "40" });
	});

	it("必要台数が 0 の発電機では、空配列になる", () => {
		// 0 個の素材行を出すと「建てるのに素材が要る」と読めてしまう
		const coal = requirementFor(generatorFixtureData, "0", "coal-generator");
		expect(coal.count).toBe(0n);

		expect(generatorConstructionCost(generatorFixtureData, coal)).toEqual([]);
	});
});
