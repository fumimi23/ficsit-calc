// アイテム検索の絞り込み(issue #19)。
// 検索欄の入力でアイテム選択リストを部分一致で絞り込む。UI 非依存の純関数。
import type { ItemDef, ItemId } from "../calc/types";

/**
 * query に部分一致するアイテムの ID を返す(返却順は約束しない)。
 * 日本語名(nameJa)・英語名(name)の両方が対象で、英語は大文字小文字を無視する。
 * 空(空白のみ)の query は「絞り込みなし」として全件を返す
 */
export function filterItemIds(
	items: Record<ItemId, ItemDef>,
	query: string,
): ItemId[] {
	const q = query.trim().toLowerCase();
	return Object.entries(items)
		.filter(([, def]) =>
			[def.nameJa, def.name].some((name) => name?.toLowerCase().includes(q)),
		)
		.map(([id]) => id);
}
