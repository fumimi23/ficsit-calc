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
	buildings: {
		smelter: { name: "製錬炉", powerMW: 4 },
		constructor: { name: "構築機", powerMW: 4 },
		assembler: { name: "組立機", powerMW: 15 },
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
};
