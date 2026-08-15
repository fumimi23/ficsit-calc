// issue #22: ユーザーによるレシピ選択 — 候補の列挙とマージ規則を実データ(data/recipes.json)で固定する。
// primary 選択(issue #5)は「アイテムごとに 1 本を決定的に選ぶ」までしか担わない。
// ここで固定するのはその上に載る層: そのアイテムを第 1 出力とするレシピの候補列挙と、
// primary 選択にユーザー上書きをマージする純関数。
// UI 側(ノードのドロップダウン・循環時のエラー表示)は tests/spec/ui/recipe-picker.test.tsx。
import { describe, expect, it } from "vitest";
import recipesJson from "../../data/recipes.json";
import { Fraction } from "../../src/lib/calc/fraction";
import { planProduction } from "../../src/lib/calc/plan";
import {
	candidateRecipesByItem,
	InvalidRecipeOverrideError,
	mergeRecipeSelection,
	type RecipeSelection,
	selectPrimaryRecipes,
} from "../../src/lib/calc/select";
import { validateRecipeData } from "../../src/lib/calc/validate";

const data = validateRecipeData(recipesJson);
const frac = (num: number, den = 1) => Fraction.of(num, den);
const noOverrides = new Map<string, string>();

const selectedIds = (selection: RecipeSelection) =>
	[...selection]
		.map(([itemId, recipe]) => `${itemId}=${recipe.id}`)
		.sort((a, b) => (a < b ? -1 : 1));

describe("レシピ候補の列挙(issue #22)", () => {
	const candidates = candidateRecipesByItem(data);

	it("あるアイテムの候補は、そのアイテムを第 1 出力とするレシピすべてで、デフォルト → alternate の順に並ぶ", () => {
		// 燃料: デフォルト 3 本(精製・残留・開封)を ID 辞書順で並べ、最後に alternate。
		// 開封レシピも候補に残す — primary からは外れる(issue #5 規則 b)が、
		// 「開封して取り出す」はプレイヤーの選択肢としては存在するため
		expect(candidates.get("Desc_LiquidFuel_C")?.map((r) => r.id)).toEqual([
			"Recipe_LiquidFuel_C",
			"Recipe_ResidualFuel_C",
			"Recipe_UnpackageFuel_C",
			"Recipe_Alternate_DilutedFuel_C",
		]);
	});

	it("デフォルトレシピを持たないアイテムでも、alternate レシピが候補として挙がる", () => {
		expect(candidates.get("Desc_CompactedCoal_C")?.map((r) => r.id)).toEqual([
			"Recipe_Alternate_EnrichedCoal_C",
		]);
	});

	it("そのアイテムを第 1 出力とするレシピが 1 本も無いアイテムは、候補を持たない", () => {
		// 溶解シリカは副産物・入力としてしか現れない = 永遠に原料終端
		expect(candidates.has("Desc_DissolvedSilica_C")).toBe(false);
	});
});

describe("レシピ選択のマージ(issue #22)", () => {
	const primary = selectPrimaryRecipes(data);

	it("上書きが無いとき、マージ結果は primary 選択と同じになる", () => {
		expect(selectedIds(mergeRecipeSelection(data, noOverrides))).toEqual(
			selectedIds(primary),
		);
	});

	it("あるアイテムを上書きしたとき、そのアイテムだけレシピが差し替わり、他のアイテムの選択は変わらない", () => {
		const merged = mergeRecipeSelection(
			data,
			new Map([["Desc_GenericBiomass_C", "Recipe_Biomass_Leaves_C"]]),
		);

		expect(primary.get("Desc_GenericBiomass_C")?.id).toBe(
			"Recipe_Biomass_AlienProtein_C",
		);
		expect(merged.get("Desc_GenericBiomass_C")?.id).toBe(
			"Recipe_Biomass_Leaves_C",
		);
		const changed = [...merged]
			.filter(([itemId, recipe]) => primary.get(itemId)?.id !== recipe.id)
			.map(([itemId]) => itemId);
		expect(changed).toEqual(["Desc_GenericBiomass_C"]);
		expect(merged.size).toBe(primary.size);
	});

	it("primary レシピを持たないアイテムを上書きしたとき、選択マップに追加される", () => {
		expect(primary.has("Desc_CompactedCoal_C")).toBe(false);

		const merged = mergeRecipeSelection(
			data,
			new Map([["Desc_CompactedCoal_C", "Recipe_Alternate_EnrichedCoal_C"]]),
		);

		expect(merged.get("Desc_CompactedCoal_C")?.id).toBe(
			"Recipe_Alternate_EnrichedCoal_C",
		);
		expect(merged.size).toBe(primary.size + 1);
	});

	it("存在しないレシピ ID で上書きしたとき、InvalidRecipeOverrideError になる", () => {
		expect(() =>
			mergeRecipeSelection(
				data,
				new Map([["Desc_GenericBiomass_C", "Recipe_NoSuchRecipe_C"]]),
			),
		).toThrow(InvalidRecipeOverrideError);
	});

	it("そのアイテムを第 1 出力としないレシピ ID で上書きしたとき、InvalidRecipeOverrideError になる", () => {
		// UI は候補しか出さないので通常は起きない。planProduction 内の
		// 「産出しません」防波堤より手前で、原因の分かる型で弾くための約束
		expect(() =>
			mergeRecipeSelection(
				data,
				new Map([["Desc_GenericBiomass_C", "Recipe_IronPlate_C"]]),
			),
		).toThrow(InvalidRecipeOverrideError);
	});
});

describe("上書きしたレシピでの再計算(issue #22)", () => {
	it("バイオマスを「バイオマス（葉）」に上書きしたとき、葉からのチェーンとして再計算される", () => {
		const selection = mergeRecipeSelection(
			data,
			new Map([["Desc_GenericBiomass_C", "Recipe_Biomass_Leaves_C"]]),
		);

		const plan = planProduction(
			data,
			{ itemId: "Desc_GenericBiomass_C", ratePerMinute: 60 },
			selection,
		);

		// 葉 10 → バイオマス 5 / 5 秒 = 製作機 1 台で 60/分、葉の消費は 120/分
		expect(plan.root.production?.recipeId).toBe("Recipe_Biomass_Leaves_C");
		expect(plan.root.production?.building).toBe("Build_ConstructorMk1_C");
		expect(plan.root.production?.machineCount).toEqual(frac(1));
		// primary(エイリアンのタンパク質)の原料は消え、葉だけになる
		expect(plan.rawMaterials).toEqual([
			{ item: "Desc_Leaves_C", ratePerMinute: frac(120) },
		]);
	});

	it("燃料を開封レシピに上書きしたとき、循環としてエラーになる", () => {
		// 燃料 → 容器入り燃料(primary は充填) → 燃料。
		// 循環する選択も候補には出す方針なので、ここは計算側のエラーで受ける
		const selection = mergeRecipeSelection(
			data,
			new Map([["Desc_LiquidFuel_C", "Recipe_UnpackageFuel_C"]]),
		);

		expect(() =>
			planProduction(
				data,
				{ itemId: "Desc_LiquidFuel_C", ratePerMinute: 60 },
				selection,
			),
		).toThrow(/循環/);
	});
});
