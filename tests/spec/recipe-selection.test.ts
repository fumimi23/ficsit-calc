// issue #5: primary レシピの選択規則そのものを合成 fixture で固定する。
// 規則(決定順): (a) 第 1 出力とするデフォルトレシピのみ候補 / (b) 開封形(入力すべて固体・
// 出力に液体/気体)を除外 / (c) レシピ名 = アイテム名を優先 / (d) レシピ ID 辞書順。
// 実データ(data/recipes.json)への約束は default-recipe-resolution.test.ts が固定する。
import { describe, expect, it } from "vitest";
import { selectPrimaryRecipes } from "../../src/lib/calc/select";
import type { RecipeData } from "../../src/lib/calc/types";

const syntheticData: RecipeData = {
	items: {
		ore: { name: "Ore" },
		crude: { name: "Crude", form: "liquid" },
		"packaged-goo": { name: "Packaged Goo" },
		goo: { name: "Goo", form: "liquid" },
		gadget: { name: "Gadget" },
		widget: { name: "Widget" },
		scrap: { name: "Scrap" },
	},
	buildings: {
		maker: { name: "Maker", powerMW: 4 },
	},
	recipes: [
		// goo: 開封形(固体 packaged-goo → 液体 goo)と精製(液体 crude → goo)の 2 候補。
		// 開封形は名前一致(name: "Goo")でも除外される = (b) は (c) より先に効く
		{
			id: "unpackage-goo",
			name: "Goo",
			building: "maker",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "packaged-goo", amount: 1 }],
			outputs: [{ item: "goo", amount: 1 }],
		},
		{
			id: "refine-goo",
			name: "Refined Goo",
			building: "maker",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "crude", amount: 1 }],
			outputs: [{ item: "goo", amount: 1 }],
		},
		// gadget: ID 辞書順では負ける側(z-gadget)が名前一致で選ばれる (c)
		{
			id: "a-gadget",
			name: "Gadget from Scrap",
			building: "maker",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "ore", amount: 1 }],
			outputs: [{ item: "gadget", amount: 1 }],
		},
		{
			id: "z-gadget",
			name: "Gadget",
			building: "maker",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "ore", amount: 1 }],
			outputs: [{ item: "gadget", amount: 1 }],
		},
		// widget: 名前一致なし → ID 辞書順 (d)。配列順(b が先)と逆の a-widget が選ばれる。
		// alternate(0-widget)は ID 辞書順で先頭でも候補にならない。
		// scrap は b-widget の第 2 出力としてのみ産出される → (a) により候補なし
		{
			id: "0-widget",
			name: "Widget Mk0",
			building: "maker",
			durationSeconds: 6,
			alternate: true,
			inputs: [{ item: "ore", amount: 1 }],
			outputs: [{ item: "widget", amount: 1 }],
		},
		{
			id: "b-widget",
			name: "Widget Mk2",
			building: "maker",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "ore", amount: 1 }],
			outputs: [
				{ item: "widget", amount: 1 },
				{ item: "scrap", amount: 1 },
			],
		},
		{
			id: "a-widget",
			name: "Widget Mk1",
			building: "maker",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "ore", amount: 1 }],
			outputs: [{ item: "widget", amount: 1 }],
		},
	],
	generators: [],
};

describe("primary レシピの選択規則(issue #5)", () => {
	const selection = selectPrimaryRecipes(syntheticData);

	it("開封形のレシピ(入力がすべて固体で、出力に液体/気体を含む)は、名前が一致していても候補から除外される", () => {
		expect(selection.get("goo")?.id).toBe("refine-goo");
	});

	it("複数候補があるとき、レシピ名 = アイテム名のレシピが ID 辞書順より優先される", () => {
		expect(selection.get("gadget")?.id).toBe("z-gadget");
	});

	it("名前一致が無ければレシピ ID の辞書順で先頭が選ばれる(配列の定義順に依存しない)", () => {
		expect(selection.get("widget")?.id).toBe("a-widget");
	});

	it("alternate レシピは ID 辞書順で先頭でも候補にならない", () => {
		expect(selection.get("widget")?.id).not.toBe("0-widget");
	});

	it("第 2 出力としてのみ産出されるアイテムは候補を持たない(= 原料として終端する)", () => {
		expect(selection.has("scrap")).toBe(false);
	});

	it("そもそもレシピが無いアイテムは候補を持たない", () => {
		expect(selection.has("ore")).toBe(false);
	});
});
