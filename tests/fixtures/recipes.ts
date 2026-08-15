// 実ゲーム(Satisfactory 1.0)のデフォルトレシピ値を模した fixture。
// issue #1 のスキーマ先行開発用。パーサー(#2)完成後も spec テストはこの fixture で維持する。
import type { RecipeData } from "../../src/lib/calc/types";

export const fixtureData: RecipeData = {
	items: {
		"iron-ore": { name: "鉄鉱石" },
		"iron-ingot": { name: "鉄インゴット" },
		"iron-plate": { name: "鉄板" },
		"iron-rod": { name: "鉄のロッド" },
		screw: { name: "ネジ" },
		"reinforced-iron-plate": { name: "強化鉄板" },
	},
	// 建設素材(issue #21)は items に既にあるアイテムだけで組む。
	// 新しいアイテムを足すと「全 6 アイテムに戻る」を約束している item-search の UI テストが壊れる
	buildings: {
		smelter: {
			name: "製錬炉",
			powerMW: 4,
			constructionCost: [{ item: "iron-rod", amount: 5 }],
		},
		constructor: {
			name: "構築機",
			powerMW: 4,
			constructionCost: [
				{ item: "reinforced-iron-plate", amount: 2 },
				{ item: "iron-rod", amount: 8 },
			],
		},
		assembler: {
			name: "組立機",
			powerMW: 15,
			constructionCost: [
				{ item: "reinforced-iron-plate", amount: 8 },
				{ item: "screw", amount: 20 },
			],
		},
	},
	recipes: [
		{
			id: "iron-ingot",
			name: "鉄インゴット",
			building: "smelter",
			durationSeconds: 2,
			alternate: false,
			inputs: [{ item: "iron-ore", amount: 1 }],
			outputs: [{ item: "iron-ingot", amount: 1 }],
		},
		{
			id: "iron-plate",
			name: "鉄板",
			building: "constructor",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "iron-ingot", amount: 3 }],
			outputs: [{ item: "iron-plate", amount: 2 }],
		},
		{
			id: "iron-rod",
			name: "鉄のロッド",
			building: "constructor",
			durationSeconds: 4,
			alternate: false,
			inputs: [{ item: "iron-ingot", amount: 1 }],
			outputs: [{ item: "iron-rod", amount: 1 }],
		},
		{
			id: "screw",
			name: "ネジ",
			building: "constructor",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "iron-rod", amount: 1 }],
			outputs: [{ item: "screw", amount: 4 }],
		},
		{
			id: "reinforced-iron-plate",
			name: "強化鉄板",
			building: "assembler",
			durationSeconds: 12,
			alternate: false,
			inputs: [
				{ item: "iron-plate", amount: 6 },
				{ item: "screw", amount: 12 },
			],
			outputs: [{ item: "reinforced-iron-plate", amount: 1 }],
		},
	],
	// 発電機は generatorFixtureData 側に置く(理由は下のコメント)
	generators: [],
};

// 発電機入りの fixture(issue #20)。fixtureData 自体に足さないのは、
// アイテム件数を数える既存の UI テスト(tests/spec/ui/item-search.test.tsx の
// 「全 6 アイテムに戻る」)が fixtureData のアイテム数を約束にしているため。
// 鉄板 30/分 = 総電力 12MW を発電側の検算に使う。
export const generatorFixtureData: RecipeData = {
	...fixtureData,
	items: {
		...fixtureData.items,
		coal: { name: "石炭" },
		water: { name: "水", form: "liquid" },
		fuel: { name: "燃料", form: "liquid" },
	},
	generators: [
		{
			id: "coal-generator",
			name: "石炭発電機",
			powerMW: 75,
			fuels: [
				{
					item: "coal",
					energyMJ: 300,
					// Docs の mSupplementalToPowerRatio(10 L/MJ)を m³/MJ にしたもの
					supplemental: { item: "water", amountPerMJ: "0.01" },
				},
			],
			constructionCost: [
				{ item: "reinforced-iron-plate", amount: 20 },
				{ item: "iron-rod", amount: 10 },
			],
		},
		{
			id: "fuel-generator",
			name: "燃料式発電機",
			powerMW: 250,
			// 液体燃料は Docs では 0.75 MJ/L。数量の m³ 換算(×1000)後は 750 MJ/m³
			fuels: [{ item: "fuel", energyMJ: 750 }],
			constructionCost: [
				{ item: "iron-plate", amount: 15 },
				{ item: "screw", amount: 50 },
			],
		},
	],
};
