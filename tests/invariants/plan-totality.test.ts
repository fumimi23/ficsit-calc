// issue #5 invariants: recipes.json の全アイテムについて planProduction が例外なく完了する。
// primary 選択規則(開封形レシピの除外)が充填⇔開封の循環を実データ全域で断つことの ∀ 検査。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { planProduction } from "../../src/lib/calc/plan";
import { validateRecipeData } from "../../src/lib/calc/validate";

const data = validateRecipeData(recipesJson);

describe("invariants: 生産計画の全域性", () => {
	it("全アイテムで planProduction が例外なく完了する", () => {
		const failures: string[] = [];
		for (const itemId of Object.keys(data.items)) {
			try {
				planProduction(data, { itemId, ratePerMinute: 60 });
			} catch (error) {
				failures.push(`${itemId}: ${error}`);
			}
		}
		expect(failures).toEqual([]);
	});
});
