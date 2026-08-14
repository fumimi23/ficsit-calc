// issue #12: alternate レシピの収録 — 実データ(data/recipes.json)に対する約束。
// パーサーの収録挙動そのものは docs-parser.test.ts が fixture で固定する。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { validateRecipeData } from "../../src/lib/calc/validate";

const data = validateRecipeData(recipesJson);

describe("alternate レシピの収録(issue #12)", () => {
	it("data/recipes.json に alternate: true のレシピが収録されている", () => {
		expect(data.recipes.some((r) => r.alternate)).toBe(true);
	});

	it("代替レシピしか生産手段がないアイテム(圧縮石炭)の alternate レシピが引ける", () => {
		// 「生産手段」は primary 選択規則 (a) と同じく第 1 出力で判定する
		// (ロケット燃料等の副産物(第 2 出力)としての産出は生産手段に数えない)
		const producers = data.recipes.filter(
			(r) => r.outputs[0]?.item === "Desc_CompactedCoal_C",
		);
		expect(producers.length).toBeGreaterThan(0);
		// デフォルトレシピでの生産手段が無い(= 代替のみ)ことも固定する。
		// これが崩れたら primary 選択の前提(圧縮石炭は原料終端)ごと見直しになる
		expect(producers.every((r) => r.alternate)).toBe(true);
	});
});
