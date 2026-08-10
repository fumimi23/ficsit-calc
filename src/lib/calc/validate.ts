// RecipeData(data/recipes.json)のスキーマ検証。
// パーサーの出力検証と、invariants テスト(コミット済み recipes.json の横断検査)の両方で使う。
// JSON Schema + ajv 等の依存は入れない(検査対象がこの 1 スキーマだけで、
// ExactNumeric の正値検査など Fraction と絡む独自ルールがあるため)。
import { Fraction } from "./fraction";
import type { RecipeData } from "./types";

const FORMS = new Set(["solid", "liquid", "gas"]);

/**
 * 値が RecipeData のスキーマに準拠していることを検証して返す。違反は Error。
 * 検査内容: 構造と型 / 参照整合性(レシピの入出力アイテム・機械が辞書に存在) /
 * 数値の正当性(電力・所要時間・数量が正の ExactNumeric) / レシピ ID の一意性。
 */
export function validateRecipeData(value: unknown): RecipeData {
	const root = asRecord(value, "recipes.json");
	const items = asRecord(root.items, "items");
	const buildings = asRecord(root.buildings, "buildings");
	if (!Array.isArray(root.recipes)) {
		throw new Error("recipes が配列ではありません");
	}

	for (const [id, raw] of Object.entries(items)) {
		requireNonEmpty(id, "items のキー");
		const item = asRecord(raw, `items.${id}`);
		requireName(item, `items.${id}`);
		if (item.form !== undefined && !FORMS.has(item.form as string)) {
			throw new Error(`items.${id}.form が不正です: ${item.form}`);
		}
	}

	for (const [id, raw] of Object.entries(buildings)) {
		requireNonEmpty(id, "buildings のキー");
		const building = asRecord(raw, `buildings.${id}`);
		requireName(building, `buildings.${id}`);
		requirePositive(building.powerMW, `buildings.${id}.powerMW`);
	}

	const recipeIds = new Set<string>();
	for (const raw of root.recipes) {
		const recipe = asRecord(raw, "recipes の要素");
		const id = requireNonEmpty(recipe.id, "recipes[].id");
		if (recipeIds.has(id)) {
			throw new Error(`レシピ ID が重複しています: ${id}`);
		}
		recipeIds.add(id);
		requireName(recipe, id);
		requirePositive(recipe.durationSeconds, `${id}.durationSeconds`);
		if (typeof recipe.alternate !== "boolean") {
			throw new Error(`${id}.alternate が boolean ではありません`);
		}
		const buildingId = requireNonEmpty(recipe.building, `${id}.building`);
		if (!(buildingId in buildings)) {
			throw new Error(
				`${id} の機械がビルディング辞書にありません: ${buildingId}`,
			);
		}
		for (const side of ["inputs", "outputs"] as const) {
			const list = recipe[side];
			if (!Array.isArray(list)) {
				throw new Error(`${id}.${side} が配列ではありません`);
			}
			if (side === "outputs" && list.length === 0) {
				throw new Error(`${id}.outputs が空です`);
			}
			for (const [i, entry] of list.entries()) {
				const ingredient = asRecord(entry, `${id}.${side}[${i}]`);
				const itemId = requireNonEmpty(
					ingredient.item,
					`${id}.${side}[${i}].item`,
				);
				if (!(itemId in items)) {
					throw new Error(
						`${id}.${side}[${i}] のアイテムがアイテム辞書にありません: ${itemId}`,
					);
				}
				requirePositive(ingredient.amount, `${id}.${side}[${i}].amount`);
			}
		}
	}

	return value as RecipeData;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} がオブジェクトではありません`);
	}
	return value as Record<string, unknown>;
}

function requireNonEmpty(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} が空でない文字列ではありません: ${value}`);
	}
	return value;
}

function requireName(entry: Record<string, unknown>, label: string): void {
	requireNonEmpty(entry.name, `${label}.name`);
	if (entry.nameJa !== undefined) {
		requireNonEmpty(entry.nameJa, `${label}.nameJa`);
	}
}

/** ExactNumeric(number | 十進文字列)で、かつ正の値であることを検証する */
function requirePositive(value: unknown, label: string): void {
	if (typeof value !== "number" && typeof value !== "string") {
		throw new Error(`${label} が数値でも十進文字列でもありません: ${value}`);
	}
	let parsed: Fraction;
	try {
		parsed = Fraction.from(value);
	} catch {
		// Fraction.from の RangeError をそのまま流すと、どのフィールドの違反かが分からなくなる
		throw new Error(`${label} が十進表記ではありません: ${value}`);
	}
	if (parsed.isZero() || parsed.isNegative()) {
		throw new Error(`${label} が正の値ではありません: ${value}`);
	}
}
