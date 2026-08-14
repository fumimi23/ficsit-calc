// issue #19: アイテム検索 — 検索欄で選択リストを絞り込めるようにする。
// 絞り込みロジックを純関数として固定する(受け入れ条件 4)。
// 部分一致は日本語名(nameJa)・英語名(name)の両方が対象で、英語は大文字小文字を無視する。
import { describe, expect, it } from "vitest";
import type { ItemDef, ItemId } from "../../src/lib/calc/types";
import { filterItemIds } from "../../src/lib/ui/item-search";

const items: Record<ItemId, ItemDef> = {
	"iron-ore": { name: "Iron Ore", nameJa: "鉄鉱石" },
	"iron-plate": { name: "Iron Plate", nameJa: "鉄板" },
	"copper-ingot": { name: "Copper Ingot", nameJa: "銅のインゴット" },
};

describe("アイテム検索の絞り込み(issue #19)", () => {
	it("日本語名に部分一致するアイテムだけが返る", () => {
		expect(filterItemIds(items, "鉄")).toEqual(["iron-ore", "iron-plate"]);
	});

	it("英語名にも部分一致し、大文字小文字は無視される", () => {
		expect(filterItemIds(items, "plate")).toEqual(["iron-plate"]);
		expect(filterItemIds(items, "PLATE")).toEqual(["iron-plate"]);
	});

	it("空(空白のみ)のクエリでは全アイテムが返る", () => {
		expect(filterItemIds(items, "")).toEqual(Object.keys(items));
		expect(filterItemIds(items, "   ")).toEqual(Object.keys(items));
	});

	it("どの名前にもマッチしないとき、空配列が返る", () => {
		expect(filterItemIds(items, "存在しない名前")).toEqual([]);
	});

	it("nameJa が無いアイテムは name だけで判定される", () => {
		// 実データ整備前の fixture 等、name に日本語名だけを持つデータでも動く
		const jaOnly: Record<ItemId, ItemDef> = { screw: { name: "ネジ" } };
		expect(filterItemIds(jaOnly, "ネジ")).toEqual(["screw"]);
		expect(filterItemIds(jaOnly, "iron")).toEqual([]);
	});
});
