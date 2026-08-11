import { Fraction } from "./fraction";
import { type RecipeSelection, selectPrimaryRecipes } from "./select";
import type {
	ExactNumeric,
	ItemId,
	ItemRate,
	MachineRequirement,
	PlanNode,
	ProductionPlan,
	RecipeData,
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
 * レシピグラフを目標から遡って再帰展開し、レシピ選択(selection)に無いアイテム
 * (真の原料のほか、副産物のみ・開封のみ等で primary レシピを持たないアイテム)で終端する。
 * selection を省略すると selectPrimaryRecipes の規則(issue #5)で選ぶ。
 * 多出力レシピの第 2 以降の出力は byproducts に余剰として集計し、需要とは相殺しない。
 * 数値は誤差のない分数(Fraction)で保持し、機械台数は端数のまま返す
 * (丸め・クロック提案は表示側の関心事)。
 */
export function planProduction(
	data: RecipeData,
	target: ProductionTarget,
	selection: RecipeSelection = selectPrimaryRecipes(data),
): ProductionPlan {
	// 非有限・十進表記でない入力は Fraction.from が RangeError にする
	const targetRate = Fraction.from(target.ratePerMinute);
	if (targetRate.isNegative()) {
		throw new RangeError(
			`生産レートは 0 以上で指定してください: ${target.ratePerMinute}`,
		);
	}

	// レシピ単位・アイテム単位の合算。同一中間素材が複数の枝から要求されても重複なく合算する
	const machines = new Map<string, MachineRequirement>();
	const rawMaterials = new Map<ItemId, ItemRate>();
	const byproducts = new Map<ItemId, ItemRate>();

	const addRate = (
		acc: Map<ItemId, ItemRate>,
		itemId: ItemId,
		ratePerMinute: Fraction,
	) => {
		const entry = acc.get(itemId) ?? { item: itemId, ratePerMinute: ZERO };
		entry.ratePerMinute = entry.ratePerMinute.add(ratePerMinute);
		acc.set(itemId, entry);
	};

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

		const recipe = selection.get(itemId);
		if (!recipe) {
			// primary レシピを持たないアイテム = 原料。ここで終端する
			addRate(rawMaterials, itemId, ratePerMinute);
			return { item: itemId, ratePerMinute, inputs: [] };
		}

		const building = data.buildings[recipe.building];
		if (!building) {
			throw new Error(
				`機械が見つかりません: ${recipe.building}(レシピ ${recipe.id})`,
			);
		}

		const output = recipe.outputs.find((o) => o.item === itemId);
		if (!output) {
			// selectPrimaryRecipes の結果では起きない。将来のユーザー選択(ロードマップ 3)の防波堤
			throw new Error(
				`選択されたレシピ ${recipe.id} は ${itemId} を産出しません`,
			);
		}
		const craftsPerMinute = ratePerMinute.div(Fraction.from(output.amount));
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

		// 要求されたアイテム以外の出力は余剰(byproducts)。需要とは相殺しない(issue #5)
		for (const other of recipe.outputs) {
			if (other.item === itemId) continue;
			addRate(
				byproducts,
				other.item,
				Fraction.from(other.amount).mul(craftsPerMinute),
			);
		}

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
		byproducts: [...byproducts.values()],
		totalPowerMW,
	};
}
