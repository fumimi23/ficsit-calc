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
	// 採取設備(issue #23)は各 spec のローカル fixture に持たせる。ここに足すと
	// 総電力・建設コストを約束にしている既存 UI テストの期待値が動いてしまう
	extractors: [],
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

// レシピ選択 UI(issue #22)用の fixture。1 アイテムに複数レシピがある構図
// —— デフォルト 2 本 / 開封形(循環の種) / alternate のみ —— を最小構成で再現する。
// fixtureData を拡張しないのは、アイテム件数(item-search)やチェーン構成
// (production-planner)を約束にしている既存 UI テストが壊れるため。
export const multiRecipeFixtureData: RecipeData = {
	items: {
		biomass: { name: "バイオマス" },
		leaves: { name: "葉" },
		wood: { name: "木材" },
		fuel: { name: "燃料", form: "liquid" },
		"crude-oil": { name: "原油", form: "liquid" },
		"packaged-fuel": { name: "包装済み燃料" },
		canister: { name: "空の容器" },
		plastic: { name: "プラスチック" },
		"compacted-coal": { name: "圧縮石炭" },
		coal: { name: "石炭" },
		sulfur: { name: "硫黄" },
	},
	buildings: {
		constructor: {
			name: "構築機",
			powerMW: 4,
			constructionCost: [{ item: "plastic", amount: 5 }],
		},
		assembler: {
			name: "組立機",
			powerMW: 15,
			constructionCost: [{ item: "plastic", amount: 10 }],
		},
		refinery: {
			name: "精製機",
			powerMW: 30,
			constructionCost: [{ item: "plastic", amount: 20 }],
		},
		packager: {
			name: "梱包機",
			powerMW: 10,
			constructionCost: [{ item: "plastic", amount: 8 }],
		},
	},
	recipes: [
		// バイオマス: デフォルト 2 本。レシピ名はどちらもアイテム名「バイオマス」と
		// 不一致なので名前一致規則が不発になり、ID 辞書順で biomass-leaves が primary。
		// 目標 60/分 のとき 葉 = 1 台 / 4MW / 葉 120 個、木 = 0.5 台 / 2MW / 木材 15 個 と、
		// 台数・電力・原料の 3 つが同時に変わる値にしてある
		{
			id: "biomass-leaves",
			name: "バイオマス（葉）",
			building: "constructor",
			durationSeconds: 5,
			alternate: false,
			inputs: [{ item: "leaves", amount: 10 }],
			outputs: [{ item: "biomass", amount: 5 }],
		},
		{
			id: "biomass-wood",
			name: "バイオマス（木）",
			building: "constructor",
			durationSeconds: 4,
			alternate: false,
			inputs: [{ item: "wood", amount: 2 }],
			outputs: [{ item: "biomass", amount: 8 }],
		},
		// 燃料: デフォルト 2 本だが unpack-fuel は開封形(入力すべて固体・出力に液体)
		// なので primary からは外れる。候補には残るので、選ぶと
		// 包装済み燃料 → 燃料 → 包装済み燃料 の循環が起きる
		{
			id: "fuel-from-oil",
			name: "燃料",
			building: "refinery",
			durationSeconds: 6,
			alternate: false,
			inputs: [{ item: "crude-oil", amount: 6 }],
			outputs: [{ item: "fuel", amount: 4 }],
		},
		{
			id: "unpack-fuel",
			name: "未包装燃料",
			building: "packager",
			durationSeconds: 2,
			alternate: false,
			inputs: [{ item: "packaged-fuel", amount: 2 }],
			outputs: [
				{ item: "fuel", amount: 2 },
				{ item: "canister", amount: 2 },
			],
		},
		// packaged-fuel を目標にすると、燃料(候補 2)・空の容器(候補 1)・
		// 原油/プラスチック(候補 0)が 1 つのツリーに揃う
		{
			id: "pack-fuel",
			name: "包装済み燃料",
			building: "packager",
			durationSeconds: 4,
			alternate: false,
			inputs: [
				{ item: "fuel", amount: 2 },
				{ item: "canister", amount: 2 },
			],
			outputs: [{ item: "packaged-fuel", amount: 2 }],
		},
		{
			id: "make-canister",
			name: "空の容器",
			building: "constructor",
			durationSeconds: 4,
			alternate: false,
			inputs: [{ item: "plastic", amount: 2 }],
			outputs: [{ item: "canister", amount: 4 }],
		},
		// alternate しか生産手段が無いアイテム。デフォルトでは原料終端で、
		// 上書きするとチェーンが伸びる(実データの圧縮石炭と同じ構図)
		{
			id: "enriched-coal",
			name: "圧縮石炭",
			building: "assembler",
			durationSeconds: 12,
			alternate: true,
			inputs: [
				{ item: "coal", amount: 5 },
				{ item: "sulfur", amount: 5 },
			],
			outputs: [{ item: "compacted-coal", amount: 5 }],
		},
	],
	// 発電機を入れないのは、必要発電機の表がレシピ切り替えの検算(台数・電力・原料)に
	// 関わらないため。採取設備(issue #23)も同じ理由で入れない
	generators: [],
	extractors: [],
};
