// 表示名の解決。日本語名(nameJa)が無ければ英語名(name)、それも無ければ ID にフォールバック
import type {
	BuildingId,
	ExtractorId,
	GeneratorId,
	ItemId,
	RecipeData,
} from "../calc/types";

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

export function generatorLabel(
	data: RecipeData,
	generatorId: GeneratorId,
): string {
	const def = data.generators.find((g) => g.id === generatorId);
	return def?.nameJa ?? def?.name ?? generatorId;
}

export function extractorLabel(
	data: RecipeData,
	extractorId: ExtractorId,
): string {
	const def = data.extractors.find((e) => e.id === extractorId);
	return def?.nameJa ?? def?.name ?? extractorId;
}
