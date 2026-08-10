// 横断不変条件: 個別機能ではなくデータセット全体を ∀ 検査する。
// validateRecipeData が検査する内容 = スキーマ準拠・参照整合性(レシピの入出力アイテムは
// アイテム辞書に、機械はビルディング辞書に存在)・正の電力/所要時間/数量・レシピ ID の一意性。
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
});
