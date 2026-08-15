// issue #48: 機械 1 台分の生産レート — アイテム選択時に目標レート欄へ自動入力する値の
// 算出規則を固定する。UI への反映は tests/spec/ui/production-planner.test.tsx が固定する。
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import { singleMachineRate } from "../../src/lib/calc/machine-rate";
import { selectPrimaryRecipes } from "../../src/lib/calc/select";
import type { RecipeDef, RecipeIngredient } from "../../src/lib/calc/types";
import { fixtureData } from "../fixtures/recipes";

/** 見るのは outputs と durationSeconds だけなので、他は最小限で埋める */
const recipeOf = (
	durationSeconds: number,
	outputs: RecipeIngredient[],
): RecipeDef => ({
	id: "test-recipe",
	name: "テストレシピ",
	building: "constructor",
	durationSeconds,
	alternate: false,
	inputs: [],
	outputs,
});

describe("機械 1 台分の生産レート(issue #48)", () => {
	it("primary レシピを持つアイテムでは、出力数 × 60 ÷ durationSeconds の 1 台分レートを返す", () => {
		// 鉄板は 6 秒で 2 枚 → 20/分
		const rate = singleMachineRate(
			selectPrimaryRecipes(fixtureData),
			"iron-plate",
		);

		expect(rate?.equals(Fraction.of(20))).toBe(true);
	});

	it("多出力レシピでは、選択したアイテムに対応する出力数で計算される", () => {
		// 6 秒でプラスチック 2 + 廃重油 1。第 2 出力に割り当てられたアイテムでも
		// そのアイテム自身の出力数で計算する
		const recipe = recipeOf(6, [
			{ item: "plastic", amount: 2 },
			{ item: "residue", amount: 1 },
		]);
		const selection = new Map([
			["plastic", recipe],
			["residue", recipe],
		]);

		expect(
			singleMachineRate(selection, "plastic")?.equals(Fraction.of(20)),
		).toBe(true);
		expect(
			singleMachineRate(selection, "residue")?.equals(Fraction.of(10)),
		).toBe(true);
	});

	it("primary レシピを持たないアイテム(原料)では undefined を返す", () => {
		// 原料には「1 台分」が無いので、既定値を返さず自動入力しない(issue #48 の決定)
		expect(
			singleMachineRate(selectPrimaryRecipes(fixtureData), "iron-ore"),
		).toBeUndefined();
	});

	it("割り切れないレートも誤差なく保持される", () => {
		// 7 秒で 1 個 → 60/7 個/分。float だと 8.571428571428571 に丸まる
		const selection = new Map([
			["slow", recipeOf(7, [{ item: "slow", amount: 1 }])],
		]);

		expect(
			singleMachineRate(selection, "slow")?.equals(Fraction.of(60, 7)),
		).toBe(true);
	});
});
