// issue #18: 生産チェーンの接続図(フローグラフ)を表示する。
// 計画 → mermaid flowchart 記法への変換(純関数)の約束を固定する。
// ノード = 機械グループ(レシピ・機械 × 台数)と原料、エッジ = アイテム名と流量/分。
// 描画そのもの(SVG 化)は mermaid に委譲し、見た目はブラウザ手動確認とする。
import { describe, expect, it } from "vitest";
import { planProduction } from "../../src/lib/calc/plan";
import type { RecipeData } from "../../src/lib/calc/types";
import { planToMermaid } from "../../src/lib/ui/flow-graph";
import { fixtureData } from "../fixtures/recipes";

describe("接続図: 計画 → mermaid 記法の変換(issue #18)", () => {
	it("強化鉄板 5/分 のとき、機械グループ・原料・目標のノードと流量付きエッジの flowchart になる", () => {
		const plan = planProduction(fixtureData, {
			itemId: "reinforced-iron-plate",
			ratePerMinute: 5,
		});

		expect(planToMermaid(fixtureData, plan)).toBe(
			[
				"flowchart TD",
				'\trecipe_reinforced_iron_plate["強化鉄板<br/>組立機 × 1"]',
				'\trecipe_iron_plate["鉄板<br/>構築機 × 1.5"]',
				'\trecipe_iron_ingot["鉄インゴット<br/>製錬炉 × 2"]',
				'\trecipe_screw["ネジ<br/>構築機 × 1.5"]',
				'\trecipe_iron_rod["鉄のロッド<br/>構築機 × 1"]',
				'\traw_iron_ore(["鉄鉱石（原料）"])',
				'\ttarget_reinforced_iron_plate(["強化鉄板（目標）"])',
				'\trecipe_iron_plate -- "鉄板 30 /分（Mk.1）" --> recipe_reinforced_iron_plate',
				'\trecipe_iron_ingot -- "鉄インゴット 45 /分（Mk.1）" --> recipe_iron_plate',
				'\traw_iron_ore -- "鉄鉱石 60 /分（Mk.1）" --> recipe_iron_ingot',
				'\trecipe_screw -- "ネジ 60 /分（Mk.1）" --> recipe_reinforced_iron_plate',
				'\trecipe_iron_rod -- "鉄のロッド 15 /分（Mk.1）" --> recipe_screw',
				'\trecipe_iron_ingot -- "鉄インゴット 15 /分（Mk.1）" --> recipe_iron_rod',
				'\trecipe_reinforced_iron_plate -- "強化鉄板 5 /分（Mk.1）" --> target_reinforced_iron_plate',
			].join("\n"),
		);
	});

	it("ツリーで重複する中間素材(鉄インゴット)が図では 1 ノードに集約され、複数の消費先への分岐が見える", () => {
		const plan = planProduction(fixtureData, {
			itemId: "reinforced-iron-plate",
			ratePerMinute: 5,
		});
		const text = planToMermaid(fixtureData, plan);

		// ノード宣言は 1 つだけ(鉄板の枝とロッドの枝で共有される)
		expect(text.match(/recipe_iron_ingot\[/g)).toHaveLength(1);
		// そこから鉄板・ロッドの 2 本の矢印が出る
		expect(text).toContain(
			'recipe_iron_ingot -- "鉄インゴット 45 /分（Mk.1）" --> recipe_iron_plate',
		);
		expect(text).toContain(
			'recipe_iron_ingot -- "鉄インゴット 15 /分（Mk.1）" --> recipe_iron_rod',
		);
		// ツリーの枝ごとの重複要求(45 + 15)が原料エッジでは 1 本に合算される
		expect(text.match(/raw_iron_ore -- /g)).toHaveLength(1);
		expect(text).toContain(
			'raw_iron_ore -- "鉄鉱石 60 /分（Mk.1）" --> recipe_iron_ingot',
		);
	});

	it("副産物が出るチェーンでは、余剰ノードと産出元からのエッジが図に現れる", () => {
		// 原油 3 → プラスチック 2 + 廃重油 1(実データの Recipe_Plastic_C を模す)
		const byproductData: RecipeData = {
			items: {
				crude: { name: "原油", form: "liquid" },
				plastic: { name: "プラスチック" },
				residue: { name: "廃重油", form: "liquid" },
			},
			buildings: {
				refinery: {
					name: "精製機",
					powerMW: 30,
					constructionCost: [{ item: "plastic", amount: 1 }],
				},
			},
			recipes: [
				{
					id: "plastic",
					name: "プラスチック",
					building: "refinery",
					durationSeconds: 6,
					alternate: false,
					inputs: [{ item: "crude", amount: 3 }],
					outputs: [
						{ item: "plastic", amount: 2 },
						{ item: "residue", amount: 1 },
					],
				},
			],
			generators: [],
			extractors: [],
			// 搬送設備を入れないのは、副産物のエッジが出ること自体がこのテストの
			// 約束で、段の注記を混ぜると期待値が 2 つの約束を抱えるため
			belts: [],
			pipes: [],
		};
		const plan = planProduction(byproductData, {
			itemId: "plastic",
			ratePerMinute: 20,
		});

		expect(planToMermaid(byproductData, plan)).toBe(
			[
				"flowchart TD",
				'\trecipe_plastic["プラスチック<br/>精製機 × 1"]',
				'\traw_crude(["原油（原料）"])',
				'\tsurplus_residue(["廃重油（余剰）"])',
				'\ttarget_plastic(["プラスチック（目標）"])',
				'\trecipe_plastic -- "廃重油 10 /分" --> surplus_residue',
				'\traw_crude -- "原油 30 /分" --> recipe_plastic',
				'\trecipe_plastic -- "プラスチック 20 /分" --> target_plastic',
			].join("\n"),
		);
	});

	it("原料そのものを目標にしたとき、原料ノード → 目標ノードだけの図になる", () => {
		const plan = planProduction(fixtureData, {
			itemId: "iron-ore",
			ratePerMinute: 10,
		});

		expect(planToMermaid(fixtureData, plan)).toBe(
			[
				"flowchart TD",
				'\traw_iron_ore(["鉄鉱石（原料）"])',
				'\ttarget_iron_ore(["鉄鉱石（目標）"])',
				'\traw_iron_ore -- "鉄鉱石 10 /分（Mk.1）" --> target_iron_ore',
			].join("\n"),
		);
	});
});

// issue #35: 1 エッジ = コンベア 1 本という暗黙の前提はベルトの送量上限で崩れるので、
// 各エッジに「その流量を 1 本で運べる最低の Mk」を注記する。
// 固体はベルト、液体・気体はパイプの表で判定し、最大 Mk でも足りなければ本数を出す。
describe("接続図: エッジへの搬送設備の注記(issue #35)", () => {
	it("流量がベルト Mk.5 の上限ちょうどのとき、1 本で運べる段として（Mk.5）が注記される", () => {
		const plan = planProduction(fixtureData, {
			itemId: "iron-ingot",
			ratePerMinute: 780,
		});

		expect(planToMermaid(fixtureData, plan)).toBe(
			[
				"flowchart TD",
				'\trecipe_iron_ingot["鉄インゴット<br/>製錬炉 × 26"]',
				'\traw_iron_ore(["鉄鉱石（原料）"])',
				'\ttarget_iron_ingot(["鉄インゴット（目標）"])',
				'\traw_iron_ore -- "鉄鉱石 780 /分（Mk.5）" --> recipe_iron_ingot',
				'\trecipe_iron_ingot -- "鉄インゴット 780 /分（Mk.5）" --> target_iron_ingot',
			].join("\n"),
		);
	});

	it("最大 Mk でも 1 本で運べない流量のとき、必要本数付きで注記される", () => {
		const plan = planProduction(fixtureData, {
			itemId: "iron-ingot",
			ratePerMinute: 2400,
		});

		expect(planToMermaid(fixtureData, plan)).toBe(
			[
				"flowchart TD",
				'\trecipe_iron_ingot["鉄インゴット<br/>製錬炉 × 80"]',
				'\traw_iron_ore(["鉄鉱石（原料）"])',
				'\ttarget_iron_ingot(["鉄インゴット（目標）"])',
				'\traw_iron_ore -- "鉄鉱石 2400 /分（Mk.6 × 2 本）" --> recipe_iron_ingot',
				'\trecipe_iron_ingot -- "鉄インゴット 2400 /分（Mk.6 × 2 本）" --> target_iron_ingot',
			].join("\n"),
		);
	});

	it("液体のエッジのとき、同じ流量でもベルトではなくパイプの段で注記される", () => {
		// 300 /分 は固体ならベルト Mk.4(270 < 300 ≤ 480)、液体ならパイプ Mk.1(≤ 300)。
		// 表を取り違えると同じ数値が違う段になるので、1 つの図で両方を突き合わせる
		const pipeData: RecipeData = {
			items: {
				water: { name: "水", form: "liquid" },
				plastic: { name: "プラスチック" },
			},
			buildings: {
				refinery: {
					name: "精製機",
					powerMW: 30,
					constructionCost: [{ item: "plastic", amount: 1 }],
				},
			},
			recipes: [
				{
					id: "plastic",
					name: "プラスチック",
					building: "refinery",
					durationSeconds: 60,
					alternate: false,
					inputs: [{ item: "water", amount: 300 }],
					outputs: [{ item: "plastic", amount: 300 }],
				},
			],
			generators: [],
			extractors: [],
			belts: fixtureData.belts,
			pipes: fixtureData.pipes,
		};
		const plan = planProduction(pipeData, {
			itemId: "plastic",
			ratePerMinute: 300,
		});

		expect(planToMermaid(pipeData, plan)).toBe(
			[
				"flowchart TD",
				'\trecipe_plastic["プラスチック<br/>精製機 × 1"]',
				'\traw_water(["水（原料）"])',
				'\ttarget_plastic(["プラスチック（目標）"])',
				'\traw_water -- "水 300 /分（Mk.1）" --> recipe_plastic',
				'\trecipe_plastic -- "プラスチック 300 /分（Mk.4）" --> target_plastic',
			].join("\n"),
		);
	});

	it("ベルト・パイプが収録されていないデータのとき、エッジラベルに段の注記が付かない", () => {
		// 搬送設備を知らない古い recipes.json や搬送設備を持たないローカル fixture を
		// 読んだときに、注記なしのラベルへ縮退する(エラーにも "Mk.undefined" にもしない)
		const withoutTransports: RecipeData = {
			...fixtureData,
			belts: [],
			pipes: [],
		};
		const plan = planProduction(withoutTransports, {
			itemId: "iron-ore",
			ratePerMinute: 10,
		});

		expect(planToMermaid(withoutTransports, plan)).toBe(
			[
				"flowchart TD",
				'\traw_iron_ore(["鉄鉱石（原料）"])',
				'\ttarget_iron_ore(["鉄鉱石（目標）"])',
				'\traw_iron_ore -- "鉄鉱石 10 /分" --> target_iron_ore',
			].join("\n"),
		);
	});
});
