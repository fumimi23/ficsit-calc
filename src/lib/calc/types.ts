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
	/**
	 * 1 台建てるのに必要な建設素材(issue #21)。Docs の Build Gun 建設レシピ由来。
	 * optional にしないのは、欠落を許すと建設コストが黙って過少表示されるため
	 */
	constructionCost: RecipeIngredient[];
}

/** 発電機 ID(例: "Build_GeneratorCoal_C")。RecipeData.generators の要素の id */
export type GeneratorId = string;

/**
 * 発電機が燃やせる燃料 1 種(issue #20)。
 * 複数燃料の発電機(石炭発電機の石炭 / 圧縮石炭 / 石油コークス等)を代表 1 種に畳まないのは、
 * どれで賄うかがプレイヤーの選択であり、レートも燃料ごとに変わるため。
 */
export interface GeneratorFuelDef {
	item: ItemId;
	/** 燃料 1 単位(固体 = 個、液体・気体 = m³)あたりのエネルギー(MJ) */
	energyMJ: ExactNumeric;
	/**
	 * 副資材(石炭発電機の水など)。消費は台数ではなく発電量に比例するので、
	 * 台数あたりではなく発電 1 MJ あたりの量(m³/MJ)で持つ
	 */
	supplemental?: { item: ItemId; amountPerMJ: ExactNumeric };
}

/**
 * 発電機 1 種(issue #20)。
 * 地熱発電機は含めない: 出力が間欠泉の純度に依存し、定格 1 つでは表せないため。
 */
export interface GeneratorDef {
	id: GeneratorId;
	name: string;
	/** 日本語表示名。無ければ表示は name にフォールバック */
	nameJa?: string;
	/** 定格出力(MW)。オーバークロックは v1 スコープ外 */
	powerMW: ExactNumeric;
	fuels: GeneratorFuelDef[];
	/** 1 台建てるのに必要な建設素材(issue #21)。BuildingDef と同じく必須 */
	constructionCost: RecipeIngredient[];
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
	/** 代替レシピか。primary レシピの選択(select.ts)では候補にならない */
	alternate: boolean;
	inputs: RecipeIngredient[];
	outputs: RecipeIngredient[];
}

/** レシピデータ一式。1 アイテムに複数レシピがありうる(使うレシピは select.ts の規則で選ぶ) */
export interface RecipeData {
	items: Record<ItemId, ItemDef>;
	buildings: Record<BuildingId, BuildingDef>;
	recipes: RecipeDef[];
	/** 発電機の一覧(issue #20)。総電力から必要台数・必要燃料を出すのに使う */
	generators: GeneratorDef[];
}

// ---- 逆算結果 ----
// 数値はすべて誤差のない分数(Fraction)。表示には toDecimalString を使う。

/** レシピ 1 つ分の機械の必要数。ツリーの 1 ノード分にも、レシピ単位の合算にも使う */
export interface MachineRequirement {
	recipeId: string;
	building: BuildingId;
	/** 機械台数。端数のまま保持する(丸め・クロック提案は表示側の関心事) */
	machineCount: Fraction;
	/** 消費電力(MW) = machineCount × 機械の定格 */
	powerMW: Fraction;
}

/** 生産チェーンの 1 ノード。production が無いノードは原料(primary レシピを持たないアイテム)の終端 */
export interface PlanNode {
	item: ItemId;
	/** このノードに要求される生産レート(個/分) */
	ratePerMinute: Fraction;
	production?: MachineRequirement;
	inputs: PlanNode[];
}

/** アイテム別の合計レート。原料(rawMaterials)と余剰の副産物(byproducts)の両方に使う */
export interface ItemRate {
	item: ItemId;
	ratePerMinute: Fraction;
}

/** 逆算の結果: 生産チェーンのツリーと、レシピ単位・アイテム単位の合算値 */
export interface ProductionPlan {
	root: PlanNode;
	machines: MachineRequirement[];
	rawMaterials: ItemRate[];
	/**
	 * 多出力レシピの第 2 以降の出力(余剰)。需要とは相殺しない(issue #5)。
	 * 相殺・消費計画はロードマップ 4
	 */
	byproducts: ItemRate[];
	totalPowerMW: Fraction;
}
