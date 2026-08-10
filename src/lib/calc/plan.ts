import { Fraction } from "./fraction";
import type {
	ExactNumeric,
	ItemId,
	MachineRequirement,
	PlanNode,
	ProductionPlan,
	RawMaterialRequirement,
	RecipeData,
	RecipeDef,
} from "./types";

/** 存在しないアイテム ID を指定したときの明示的なエラー(issue #1) */
export class UnknownItemError extends Error {
	constructor(itemId: ItemId) {
		super(`アイテムが見つかりません: ${itemId}`);
		this.name = "UnknownItemError";
	}
}

export interface ProductionTarget {
	itemId: ItemId;
	/** 目標生産レート(個/分)。"7.5" のような十進文字列でも指定できる(issue #6) */
	ratePerMinute: ExactNumeric;
}

const ZERO = Fraction.of(0);
const SIXTY = Fraction.of(60);

/**
 * 目標アイテムと生産レート(個/分)から生産チェーンを逆算する。
 *
 * レシピグラフを目標から遡って再帰展開し、レシピを持たないアイテム(原料)で終端する。
 * 数値は誤差のない分数(Fraction)で保持し、機械台数は端数のまま返す
 * (丸め・クロック提案は表示側の関心事)。
 * アイテムに複数レシピがある場合はデフォルト(alternate でない)レシピを使う。
 */
export function planProduction(
	data: RecipeData,
	target: ProductionTarget,
): ProductionPlan {
	// 非有限・十進表記でない入力は Fraction.from が RangeError にする
	const targetRate = Fraction.from(target.ratePerMinute);
	if (targetRate.isNegative()) {
		throw new RangeError(
			`生産レートは 0 以上で指定してください: ${target.ratePerMinute}`,
		);
	}

	// レシピ単位・原料単位の合算。同一中間素材が複数の枝から要求されても重複なく合算する
	const machines = new Map<string, MachineRequirement>();
	const rawMaterials = new Map<ItemId, RawMaterialRequirement>();

	const expand = (
		itemId: ItemId,
		ratePerMinute: Fraction,
		stack: ItemId[],
	): PlanNode => {
		if (!(itemId in data.items)) {
			throw new UnknownItemError(itemId);
		}
		if (stack.includes(itemId)) {
			throw new Error(
				`レシピが循環しています: ${[...stack, itemId].join(" → ")}`,
			);
		}

		const recipe = findDefaultRecipe(data, itemId);
		if (!recipe) {
			// レシピを持たないアイテム = 原料。ここで終端する
			const entry = rawMaterials.get(itemId) ?? {
				item: itemId,
				ratePerMinute: ZERO,
			};
			entry.ratePerMinute = entry.ratePerMinute.add(ratePerMinute);
			rawMaterials.set(itemId, entry);
			return { item: itemId, ratePerMinute, inputs: [] };
		}

		const building = data.buildings[recipe.building];
		if (!building) {
			throw new Error(
				`機械が見つかりません: ${recipe.building}(レシピ ${recipe.id})`,
			);
		}

		// findDefaultRecipe の条件より outputs に itemId が必ず含まれる
		const outputAmount = Fraction.from(
			recipe.outputs.find((o) => o.item === itemId)?.amount ?? 1,
		);
		const craftsPerMinute = ratePerMinute.div(outputAmount);
		const machineCount = craftsPerMinute
			.mul(Fraction.from(recipe.durationSeconds))
			.div(SIXTY);
		const powerMW = machineCount.mul(Fraction.from(building.powerMW));

		const entry = machines.get(recipe.id) ?? {
			recipeId: recipe.id,
			building: recipe.building,
			machineCount: ZERO,
			powerMW: ZERO,
		};
		entry.machineCount = entry.machineCount.add(machineCount);
		entry.powerMW = entry.powerMW.add(powerMW);
		machines.set(recipe.id, entry);

		const nextStack = [...stack, itemId];
		const inputs = recipe.inputs.map((input) =>
			expand(
				input.item,
				Fraction.from(input.amount).mul(craftsPerMinute),
				nextStack,
			),
		);

		return {
			item: itemId,
			ratePerMinute,
			production: {
				recipeId: recipe.id,
				building: recipe.building,
				machineCount,
				powerMW,
			},
			inputs,
		};
	};

	const root = expand(target.itemId, targetRate, []);
	const totalPowerMW = [...machines.values()].reduce(
		(sum, m) => sum.add(m.powerMW),
		ZERO,
	);

	return {
		root,
		machines: [...machines.values()],
		rawMaterials: [...rawMaterials.values()],
		totalPowerMW,
	};
}

/** アイテムを産出するデフォルト(alternate でない)レシピを返す。無ければ null(= 原料) */
function findDefaultRecipe(data: RecipeData, itemId: ItemId): RecipeDef | null {
	return (
		data.recipes.find(
			(r) => !r.alternate && r.outputs.some((o) => o.item === itemId),
		) ?? null
	);
}
