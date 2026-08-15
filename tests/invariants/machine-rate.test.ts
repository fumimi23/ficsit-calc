// issue #48 invariants: primary レシピが選ばれた全アイテムで 1 台分レートが求まる。
// spec は fixture で算出規則を固定するが、実データ全域で自動入力が
// 「値が入らない」「0 や負が入る」に落ちないことはここで検査する。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { singleMachineRate } from "../../src/lib/calc/machine-rate";
import { selectPrimaryRecipes } from "../../src/lib/calc/select";
import { validateRecipeData } from "../../src/lib/calc/validate";

const data = validateRecipeData(recipesJson);

describe("invariants: 1 台分レートの全域性", () => {
	it("primary レシピが選ばれた全アイテムで、1 台分レートが正の値として求まる", () => {
		const selection = selectPrimaryRecipes(data);
		const failures: string[] = [];
		for (const itemId of selection.keys()) {
			const rate = singleMachineRate(selection, itemId);
			if (rate === undefined) {
				failures.push(`${itemId}: undefined`);
			} else if (rate.isZero() || rate.isNegative()) {
				failures.push(`${itemId}: ${rate.toString()}`);
			}
		}
		expect(failures).toEqual([]);
	});
});
