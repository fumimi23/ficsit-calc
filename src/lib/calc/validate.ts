// RecipeData(data/recipes.json)のスキーマ検証。
// パーサーの出力検証と、invariants テスト(コミット済み recipes.json の横断検査)の両方で使う。
// JSON Schema + ajv 等の依存は入れない(検査対象がこの 1 スキーマだけで、
// ExactNumeric の正値検査など Fraction と絡む独自ルールがあるため)。
import { Fraction } from "./fraction";
import type { RecipeData } from "./types";

const FORMS = new Set(["solid", "liquid", "gas"]);

/**
 * 値が RecipeData のスキーマに準拠していることを検証して返す。違反は Error。
 * 検査内容: 構造と型 / 参照整合性(レシピの入出力アイテム・機械・発電機の燃料・
 * 採取設備の対象資源が辞書に存在) / 数値の正当性(電力・所要時間・数量・エネルギー値・
 * 採取レートが正の ExactNumeric) / ID の一意性。
 */
export function validateRecipeData(value: unknown): RecipeData {
	const root = asRecord(value, "recipes.json");
	const items = asRecord(root.items, "items");
	const buildings = asRecord(root.buildings, "buildings");
	if (!Array.isArray(root.recipes)) {
		throw new Error("recipes が配列ではありません");
	}
	if (!Array.isArray(root.generators)) {
		throw new Error("generators が配列ではありません");
	}
	// 空配列は通す(収録漏れは invariants の担当)。ここで非空を要求すると、
	// 採取設備を持たないローカル fixture がすべて検証を通らなくなる
	if (!Array.isArray(root.extractors)) {
		throw new Error("extractors が配列ではありません");
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
		requireConstructionCost(
			building.constructionCost,
			items,
			`buildings.${id}.constructionCost`,
		);
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

	const generatorIds = new Set<string>();
	for (const raw of root.generators) {
		const generator = asRecord(raw, "generators の要素");
		const id = requireNonEmpty(generator.id, "generators[].id");
		if (generatorIds.has(id)) {
			throw new Error(`発電機 ID が重複しています: ${id}`);
		}
		generatorIds.add(id);
		requireName(generator, id);
		requirePositive(generator.powerMW, `${id}.powerMW`);
		requireConstructionCost(
			generator.constructionCost,
			items,
			`${id}.constructionCost`,
		);
		// 燃料の無い発電機は必要燃料を出せず、リストに載せる意味が無い
		if (!Array.isArray(generator.fuels) || generator.fuels.length === 0) {
			throw new Error(`${id}.fuels が空でない配列ではありません`);
		}
		for (const [i, entry] of generator.fuels.entries()) {
			const label = `${id}.fuels[${i}]`;
			const fuel = asRecord(entry, label);
			requireKnownItem(fuel.item, items, `${label}.item`);
			requirePositive(fuel.energyMJ, `${label}.energyMJ`);
			if (fuel.supplemental === undefined) continue;
			const supplemental = asRecord(fuel.supplemental, `${label}.supplemental`);
			requireKnownItem(supplemental.item, items, `${label}.supplemental.item`);
			requirePositive(
				supplemental.amountPerMJ,
				`${label}.supplemental.amountPerMJ`,
			);
		}
	}

	const extractorIds = new Set<string>();
	for (const raw of root.extractors) {
		const extractor = asRecord(raw, "extractors の要素");
		const id = requireNonEmpty(extractor.id, "extractors[].id");
		if (extractorIds.has(id)) {
			throw new Error(`採取設備 ID が重複しています: ${id}`);
		}
		extractorIds.add(id);
		requireName(extractor, id);
		requirePositive(extractor.powerMW, `${id}.powerMW`);
		// レート 0 を通すと必要台数が 0 除算になる
		requirePositive(extractor.ratePerMinute, `${id}.ratePerMinute`);
		requireConstructionCost(
			extractor.constructionCost,
			items,
			`${id}.constructionCost`,
		);
		// 何も採れない採取設備は原料に結び付けようがなく、収録されていること自体が異常
		if (
			!Array.isArray(extractor.resources) ||
			extractor.resources.length === 0
		) {
			throw new Error(`${id}.resources が空でない配列ではありません`);
		}
		for (const [i, resource] of extractor.resources.entries()) {
			requireKnownItem(resource, items, `${id}.resources[${i}]`);
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

/** アイテム ID として妥当で、かつアイテム辞書に存在することを検証する(参照整合性) */
function requireKnownItem(
	value: unknown,
	items: Record<string, unknown>,
	label: string,
): void {
	const itemId = requireNonEmpty(value, label);
	if (!(itemId in items)) {
		throw new Error(`${label} のアイテムがアイテム辞書にありません: ${itemId}`);
	}
}

/**
 * 建設素材(issue #21)を検証する。欠落・空を通すと建設コストが黙って過少表示されるので、
 * 発電機の fuels と同じく「非空の配列」を要求する。
 */
function requireConstructionCost(
	value: unknown,
	items: Record<string, unknown>,
	label: string,
): void {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`${label} が空でない配列ではありません`);
	}
	for (const [i, entry] of value.entries()) {
		const ingredient = asRecord(entry, `${label}[${i}]`);
		requireKnownItem(ingredient.item, items, `${label}[${i}].item`);
		requirePositive(ingredient.amount, `${label}[${i}].amount`);
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
