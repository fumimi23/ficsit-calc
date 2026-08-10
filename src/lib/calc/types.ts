// 計算コアのデータモデル。
// レシピデータ(data/recipes.json)のスキーマと、逆算結果(生産計画)の型を定義する。
// フレームワーク非依存の純 TS モジュール(UI からも Node スクリプトからも使う)。
import type { Fraction } from "./fraction";

/** アイテム ID(例: "iron-plate")。RecipeData.items のキー */
export type ItemId = string;

/** 機械(ビルディング)ID(例: "constructor")。RecipeData.buildings のキー */
export type BuildingId = string;

/**
 * 正確に解釈される十進数値(issue #6)。number / "1.5" のような十進文字列の
 * どちらでもよく、内部で誤差のない分数(Fraction)に変換される。
 * number も String() の最短往復表現を経由するため、JSON に書いた十進リテラルが
 * そのまま取り込まれる(例: 0.1 → 1/10)。
 */
export type ExactNumeric = number | string;

export interface ItemDef {
	/** 英語表示名 */
	name: string;
	/** 日本語表示名。無ければ表示は name にフォールバック */
	nameJa?: string;
	/** 物質形態。liquid / gas のレシピ数量は m³ 単位に変換済み */
	form?: "solid" | "liquid" | "gas";
}

export interface BuildingDef {
	name: string;
	/** 日本語表示名。無ければ表示は name にフォールバック */
	nameJa?: string;
	/** 定格消費電力(MW)。オーバークロックは v1 スコープ外 */
	powerMW: ExactNumeric;
}

export interface RecipeIngredient {
	item: ItemId;
	/** 1 クラフトあたりの個数 */
	amount: ExactNumeric;
}

export interface RecipeDef {
	id: string;
	name: string;
	/** 日本語表示名。無ければ表示は name にフォールバック */
	nameJa?: string;
	/** 製造する機械 */
	building: BuildingId;
	/** 1 クラフトの所要時間(秒) */
	durationSeconds: ExactNumeric;
	/** 代替レシピか(v1 の計算では使わないが、データモデルとしては保持する) */
	alternate: boolean;
	inputs: RecipeIngredient[];
	outputs: RecipeIngredient[];
}

/** レシピデータ一式。1 アイテムに複数レシピがありうる(v1 はデフォルトレシピのみ使う) */
export interface RecipeData {
	items: Record<ItemId, ItemDef>;
	buildings: Record<BuildingId, BuildingDef>;
	recipes: RecipeDef[];
}

// ---- 逆算結果 ----
// 数値はすべて誤差のない分数(Fraction)。表示には toDecimalString を使う。

/** 生産チェーンの 1 ノード。production が無いノードは原料(レシピを持たないアイテム)の終端 */
export interface PlanNode {
	item: ItemId;
	/** このノードに要求される生産レート(個/分) */
	ratePerMinute: Fraction;
	production?: {
		recipeId: string;
		building: BuildingId;
		/** 機械台数。端数のまま保持する(丸め・クロック提案は表示側の関心事) */
		machineCount: Fraction;
		/** このノード分の消費電力(MW) = machineCount × 機械の定格 */
		powerMW: Fraction;
	};
	inputs: PlanNode[];
}

/** レシピ単位で合算した機械の必要数 */
export interface MachineRequirement {
	recipeId: string;
	building: BuildingId;
	machineCount: Fraction;
	powerMW: Fraction;
}

export interface RawMaterialRequirement {
	item: ItemId;
	ratePerMinute: Fraction;
}

/** 逆算の結果: 生産チェーンのツリーと、レシピ単位・原料単位の合算値 */
export interface ProductionPlan {
	root: PlanNode;
	machines: MachineRequirement[];
	rawMaterials: RawMaterialRequirement[];
	totalPowerMW: Fraction;
}
