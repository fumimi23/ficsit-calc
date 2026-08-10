// 計算コアのデータモデル。
// レシピデータ(data/recipes.json)のスキーマと、逆算結果(生産計画)の型を定義する。
// フレームワーク非依存の純 TS モジュール(UI からも Node スクリプトからも使う)。

/** アイテム ID(例: "iron-plate")。RecipeData.items のキー */
export type ItemId = string;

/** 機械(ビルディング)ID(例: "constructor")。RecipeData.buildings のキー */
export type BuildingId = string;

export interface ItemDef {
	name: string;
}

export interface BuildingDef {
	name: string;
	/** 定格消費電力(MW)。オーバークロックは v1 スコープ外 */
	powerMW: number;
}

export interface RecipeIngredient {
	item: ItemId;
	/** 1 クラフトあたりの個数 */
	amount: number;
}

export interface RecipeDef {
	id: string;
	name: string;
	/** 製造する機械 */
	building: BuildingId;
	/** 1 クラフトの所要時間(秒) */
	durationSeconds: number;
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

/** 生産チェーンの 1 ノード。production が無いノードは原料(レシピを持たないアイテム)の終端 */
export interface PlanNode {
	item: ItemId;
	/** このノードに要求される生産レート(個/分) */
	ratePerMinute: number;
	production?: {
		recipeId: string;
		building: BuildingId;
		/** 機械台数。小数のまま保持する(丸め・クロック提案は表示側の関心事) */
		machineCount: number;
		/** このノード分の消費電力(MW) = machineCount × 機械の定格 */
		powerMW: number;
	};
	inputs: PlanNode[];
}

/** レシピ単位で合算した機械の必要数 */
export interface MachineRequirement {
	recipeId: string;
	building: BuildingId;
	machineCount: number;
	powerMW: number;
}

export interface RawMaterialRequirement {
	item: ItemId;
	ratePerMinute: number;
}

/** 逆算の結果: 生産チェーンのツリーと、レシピ単位・原料単位の合算値 */
export interface ProductionPlan {
	root: PlanNode;
	machines: MachineRequirement[];
	rawMaterials: RawMaterialRequirement[];
	totalPowerMW: number;
}
