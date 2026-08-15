// 機械 1 台分の生産レート(issue #48)。
// アイテム選択時に目標レート欄へ自動入力する値を求める純関数。
// 表示は toDecimalString だが計算は Fraction のまま返す
// (60 ÷ 7 のような割り切れないレートを float に落とさないため)。
import { Fraction } from "./fraction";
import type { RecipeSelection } from "./select";
import type { ItemId } from "./types";

/**
 * itemId の primary レシピで機械 1 台が生産できるレート(個/分)。
 * = 選択アイテムに対応する出力数 × 60 ÷ durationSeconds。
 * selection に無いアイテム(原料)、またはレシピの outputs に itemId が
 * 無い場合は undefined(自動入力しない)。
 */
export function singleMachineRate(
	selection: RecipeSelection,
	itemId: ItemId,
): Fraction | undefined {
	const recipe = selection.get(itemId);
	if (!recipe) return undefined;
	// outputs[0] 決め打ちにしないのは、将来のユーザー選択で第 2 出力側の
	// アイテムに割り当てられても、そのアイテム自身の出力数で計算するため
	const output = recipe.outputs.find((o) => o.item === itemId);
	if (!output) return undefined;
	// ExactNumeric は "0.5" のような十進文字列もありうるので、整数専用の
	// Fraction.of ではなく from で変換する
	return Fraction.from(output.amount)
		.mul(Fraction.of(60))
		.div(Fraction.from(recipe.durationSeconds));
}
