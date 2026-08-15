// 機械 1 台分の生産レート(issue #48)。
// アイテム選択時に目標レート欄へ自動入力する値を求める純関数。
// 表示は toDecimalString だが計算は Fraction のまま返す
// (60 ÷ 7 のような割り切れないレートを float に落とさないため)。
import type { Fraction } from "./fraction";
import type { RecipeSelection } from "./select";
import type { ItemId } from "./types";

/**
 * itemId の primary レシピで機械 1 台が生産できるレート(個/分)。
 * = 選択アイテムに対応する出力数 × 60 ÷ durationSeconds。
 * selection に無いアイテム(原料)、またはレシピの outputs に itemId が
 * 無い場合は undefined(自動入力しない)。
 */
export function singleMachineRate(
	// biome-ignore lint/correctness/noUnusedFunctionParameters: テスト先行のスケルトン(issue #48)。実装で使う
	selection: RecipeSelection,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: テスト先行のスケルトン(issue #48)。実装で使う
	itemId: ItemId,
): Fraction | undefined {
	throw new Error("未実装(issue #48)");
}
