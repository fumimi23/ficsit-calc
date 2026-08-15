// primary レシピの選択(issue #5)。
// 「アイテムごとに使うレシピを高々 1 つ、決定的に選ぶ」規則を純関数として実装する。
// 選択結果は planProduction に引数で渡す。recipes.json には焼き込まない
// (将来のユーザー選択(ロードマップ 3)が同じ機構で上書きできるようにするため)。
import type { ItemDef, ItemId, RecipeData, RecipeDef } from "./types";

/** アイテム → そのアイテムの生産に使うレシピ。無いアイテムは原料として終端する */
export type RecipeSelection = ReadonlyMap<ItemId, RecipeDef>;

/**
 * 各アイテムの primary レシピを選ぶ。規則(適用順):
 * (a) そのアイテムを第 1 出力とするデフォルトレシピだけを候補にする
 * (b) 開封形のレシピ(入力がすべて固体で、出力に液体/気体を含む)は候補から除外する
 *     — 充填⇔開封の循環の唯一の発生源のため。充填レシピは候補に残る
 * (c) 複数残ったら、レシピ名がアイテム名と一致するものを優先する
 * (d) それでも複数ならレシピ ID の辞書順で先頭(決定性の最終保証)
 * 候補が無いアイテム(真の原料・副産物のみ・開封のみ等)はマップに含めない。
 */
export function selectPrimaryRecipes(data: RecipeData): RecipeSelection {
	const candidates = new Map<ItemId, RecipeDef[]>();
	for (const recipe of data.recipes) {
		if (recipe.alternate) continue;
		const firstOutput = recipe.outputs[0];
		if (!firstOutput) continue;
		if (isUnpackaging(data, recipe)) continue;
		const list = candidates.get(firstOutput.item) ?? [];
		list.push(recipe);
		candidates.set(firstOutput.item, list);
	}

	const selection = new Map<ItemId, RecipeDef>();
	for (const [itemId, list] of candidates) {
		const itemName = data.items[itemId]?.name;
		const nameMatched = list.filter((r) => r.name === itemName);
		const pool = nameMatched.length > 0 ? nameMatched : list;
		pool.sort((x, y) => (x.id < y.id ? -1 : 1));
		// pool は非空(candidates に入る時点で 1 件以上)
		selection.set(itemId, pool[0] as RecipeDef);
	}
	return selection;
}

/**
 * アイテム → そのアイテムを第 1 出力とするレシピ一覧(issue #22)。
 * デフォルト → alternate の順、各グループ内はレシピ ID の辞書順。
 * primary 選択(上記 (a)(b))と違って alternate も開封形も除外しない
 * — 「代替レシピを使う」「開封して取り出す」はどちらもプレイヤーの選択肢として
 * 実在するため。開封形を選んだ結果の循環は planProduction のエラーで受ける。
 * 候補が 1 本も無いアイテム(副産物・入力としてしか現れないアイテム)はキーを持たない。
 */
export function candidateRecipesByItem(
	data: RecipeData,
): ReadonlyMap<ItemId, readonly RecipeDef[]> {
	const candidates = new Map<ItemId, RecipeDef[]>();
	for (const recipe of data.recipes) {
		const firstOutput = recipe.outputs[0];
		if (!firstOutput) continue;
		const list = candidates.get(firstOutput.item) ?? [];
		list.push(recipe);
		candidates.set(firstOutput.item, list);
	}
	for (const list of candidates.values()) {
		list.sort((x, y) => {
			if (x.alternate !== y.alternate) return x.alternate ? 1 : -1;
			return x.id < y.id ? -1 : 1;
		});
	}
	return candidates;
}

/** ユーザーが選び直したレシピ: アイテム → 使うレシピの ID(issue #22) */
export type RecipeOverrides = ReadonlyMap<ItemId, string>;

/** 上書きが候補規則(第 1 出力一致)を満たさないときの明示的なエラー(issue #22) */
export class InvalidRecipeOverrideError extends Error {
	constructor(itemId: ItemId, recipeId: string) {
		super(`レシピが ${itemId} の候補ではありません: ${recipeId}`);
		this.name = "InvalidRecipeOverrideError";
	}
}

/**
 * primary 選択(selectPrimaryRecipes)を基底に、ユーザーの上書きを重ねた選択を返す(issue #22)。
 * primary レシピを持たないアイテム(alternate でしか作れない・開封でしか作れない等)への
 * 上書きは、選択マップへの追加になる = 原料終端だったノードからチェーンが伸びる。
 * 候補でないレシピ ID は InvalidRecipeOverrideError で弾く。UI は候補しか出さないので
 * 通常は起きないが、planProduction の「産出しません」より手前で原因の分かる型にする。
 */
export function mergeRecipeSelection(
	data: RecipeData,
	overrides: RecipeOverrides,
): RecipeSelection {
	const candidates = candidateRecipesByItem(data);
	const merged = new Map(selectPrimaryRecipes(data));
	for (const [itemId, recipeId] of overrides) {
		const recipe = candidates.get(itemId)?.find((r) => r.id === recipeId);
		if (!recipe) {
			throw new InvalidRecipeOverrideError(itemId, recipeId);
		}
		merged.set(itemId, recipe);
	}
	return merged;
}

/** 開封形 = 入力がすべて固体で、出力に液体/気体を含むレシピ */
function isUnpackaging(data: RecipeData, recipe: RecipeDef): boolean {
	return (
		recipe.inputs.every((i) => !isFluid(data.items[i.item])) &&
		recipe.outputs.some((o) => isFluid(data.items[o.item]))
	);
}

/** form 未指定は固体扱い(スキーマの既定) */
function isFluid(item: ItemDef | undefined): boolean {
	return item?.form === "liquid" || item?.form === "gas";
}
