// 建設コストの合算(issue #21)。計画に並ぶ機械・発電機を建てるのに要る素材を数える。
// 建設台数はレシピ単位で切り上げる: 端数の 1 台も設備としては 1 台建てる必要があり、
// 別レシピの端数と足して 1 台にはできない(0.5 台 + 0.5 台 = 2 台分)。
// 消費レート(個/分)とは単位が違う量なので ItemRate ではなく ItemQuantity で返す。
import { Fraction } from "./fraction";
import type { GeneratorRequirement } from "./generators";
import type {
	ItemId,
	MachineRequirement,
	RecipeData,
	RecipeIngredient,
} from "./types";

/** アイテム別の個数(建設コストなど、レートではない量) */
export interface ItemQuantity {
	item: ItemId;
	amount: Fraction;
}

/**
 * 機械分の建設コスト。レシピ単位の建設台数(切り上げ)× その機械の建設素材を
 * アイテム別に合算する。返り値の並び順は約束しない。
 */
export function sumMachineConstructionCost(
	data: RecipeData,
	machines: MachineRequirement[],
): ItemQuantity[] {
	const totals = new Map<ItemId, Fraction>();
	for (const machine of machines) {
		const building = data.buildings[machine.building];
		// 黙って 0 個として飛ばすと建設コストが過少表示になる
		if (!building) {
			throw new Error(
				`機械がビルディング辞書にありません: ${machine.building}`,
			);
		}
		const count = machine.machineCount.ceil();
		// 0 個の素材行を出すと「建てるのに素材が要る」と読めてしまう
		// (レート 0 の計画では全機械の建設台数が 0 になる)
		if (count === 0n) continue;
		addCost(totals, building.constructionCost, Fraction.of(count));
	}
	return toQuantities(totals);
}

/**
 * 発電機 1 種別分の建設コスト =「この種別で賄う場合」の必要台数 × 建設素材。
 * 全種別の合算はしない(種別は代替案の並記であり、足すと意味を成さない)。
 */
export function generatorConstructionCost(
	data: RecipeData,
	requirement: GeneratorRequirement,
): ItemQuantity[] {
	const generator = data.generators.find((g) => g.id === requirement.generator);
	if (!generator) {
		throw new Error(`発電機が見つかりません: ${requirement.generator}`);
	}
	// 0 個の素材行を出すと「建てるのに素材が要る」と読めてしまう
	if (requirement.count === 0n) return [];

	const totals = new Map<ItemId, Fraction>();
	addCost(totals, generator.constructionCost, Fraction.of(requirement.count));
	return toQuantities(totals);
}

function addCost(
	totals: Map<ItemId, Fraction>,
	cost: RecipeIngredient[],
	count: Fraction,
): void {
	for (const ingredient of cost) {
		const amount = Fraction.from(ingredient.amount).mul(count);
		const current = totals.get(ingredient.item);
		totals.set(ingredient.item, current ? current.add(amount) : amount);
	}
}

function toQuantities(totals: Map<ItemId, Fraction>): ItemQuantity[] {
	return [...totals].map(([item, amount]) => ({ item, amount }));
}
