// 表示名の解決。日本語名(nameJa)が無ければ英語名(name)、それも無ければ ID にフォールバック
import type { BuildingId, ItemId, RecipeData } from "../calc/types";

export function itemLabel(data: RecipeData, itemId: ItemId): string {
	const def = data.items[itemId];
	return def?.nameJa ?? def?.name ?? itemId;
}

export function buildingLabel(
	data: RecipeData,
	buildingId: BuildingId,
): string {
	const def = data.buildings[buildingId];
	return def?.nameJa ?? def?.name ?? buildingId;
}

export function recipeLabel(data: RecipeData, recipeId: string): string {
	const def = data.recipes.find((r) => r.id === recipeId);
	return def?.nameJa ?? def?.name ?? recipeId;
}
