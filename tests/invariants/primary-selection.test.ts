// issue #12 invariants: alternate 収録後も primary 選択規則が実データ全域で守られることの ∀ 検査。
// issue #5 の spec は合成 fixture で規則を固定するが、alternate 除外分岐が実データで
// 生きていること(= データ再生成でドリフトしないこと)はここで検査する。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { selectPrimaryRecipes } from "../../src/lib/calc/select";
import { validateRecipeData } from "../../src/lib/calc/validate";

const data = validateRecipeData(recipesJson);

describe("invariants: primary レシピ選択", () => {
	it("全アイテムについて、選択されるレシピに alternate が含まれない", () => {
		const violations = [...selectPrimaryRecipes(data)]
			.filter(([, recipe]) => recipe.alternate)
			.map(([itemId, recipe]) => `${itemId}: ${recipe.id}`);
		expect(violations).toEqual([]);
	});
});
