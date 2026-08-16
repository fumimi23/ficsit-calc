// @vitest-environment jsdom
// issue #3: Web UI 最小版 — 入力から結果ツリーを表示する。
// 受け入れ条件をコンポーネント spec として固定する。fixture(tests/fixtures/recipes.ts)を
// props で注入し、ゲームデータ更新で UI の約束が揺れないようにする。
// 「静的配信で動作する」(受け入れ条件 3)は自動化せず、ブラウザでの手動確認とする。
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionPlanner } from "../../../src/components/ProductionPlanner";
import type { RecipeData } from "../../../src/lib/calc/types";
import { fixtureData, generatorFixtureData } from "../../fixtures/recipes";

// mermaid の実描画は jsdom では動かない(SVG 計測 API が無い)ためモックする。
// 描画結果の見た目はブラウザ手動確認(issue #18)。変換規則は tests/spec/flow-graph.test.ts が固定する
vi.mock("mermaid", () => ({
	default: {
		initialize: vi.fn(),
		render: vi.fn(async () => ({ svg: "<svg><title>flow</title></svg>" })),
	},
}));

afterEach(cleanup);

async function enterTarget(data: RecipeData, itemId: string, rate: string) {
	const user = userEvent.setup();
	render(<ProductionPlanner data={data} />);
	await user.selectOptions(screen.getByLabelText("アイテム"), itemId);
	const rateInput = screen.getByLabelText(/目標レート/);
	// アイテム選択で 1 台分レートが自動入力される(issue #48)ので、type の前に空にする。
	// クリアしないと type は末尾への追記になり、指定した rate とは別の値が入る
	await user.clear(rateInput);
	await user.type(rateInput, rate);
	return user;
}

describe("Web UI 最小版(issue #3)", () => {
	it("アイテムを選択し目標レート(個/分)を入力したとき、機械一覧(種類・台数)・原料合計・総電力(MW)が表示される", async () => {
		await enterTarget(fixtureData, "iron-plate", "30");

		// 機械一覧: レシピごとに機械の種類・台数(小数のまま + 建設台数併記)・電力
		const table = screen.getByRole("table");
		const plateRow = within(table).getByText("鉄板").closest("tr");
		expect(plateRow).not.toBeNull();
		within(plateRow as HTMLElement).getByText("構築機");
		within(plateRow as HTMLElement).getByText("1.5 台（建設 2 台）");
		within(plateRow as HTMLElement).getByText("6 MW");

		const ingotRow = within(table).getByText("鉄インゴット").closest("tr");
		within(ingotRow as HTMLElement).getByText("製錬炉");
		within(ingotRow as HTMLElement).getByText("1.5 台（建設 2 台）");

		// 原料合計
		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("鉄鉱石: 45 /分");

		// 総電力
		screen.getByText("総電力: 12 MW");

		// 副産物が無いチェーンでは余剰は表示されない
		expect(screen.queryByRole("list", { name: "余剰（副産物）" })).toBeNull();
	});

	it("中間素材の連鎖が階層(ツリー)で表示される", async () => {
		await enterTarget(fixtureData, "reinforced-iron-plate", "5");

		const tree = screen.getByRole("list", { name: "生産ツリー" });

		// ネジの枝の中にロッド、その中にインゴット、末端は原料(鉄鉱石)
		const screwItem = within(tree).getByText("ネジ 60 /分").closest("li");
		expect(screwItem).not.toBeNull();
		const rodItem = within(screwItem as HTMLElement)
			.getByText("鉄のロッド 15 /分")
			.closest("li");
		const ingotItem = within(rodItem as HTMLElement)
			.getByText("鉄インゴット 15 /分")
			.closest("li");
		within(ingotItem as HTMLElement).getByText("鉄鉱石 15 /分（原料）");

		// 鉄板の枝は別レートで並存する
		within(tree).getByText("鉄板 30 /分");
	});

	it('".5" のような表記は正規化されて受理される(issue #8)', async () => {
		await enterTarget(fixtureData, "iron-plate", ".5");

		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("鉄鉱石: 0.75 /分");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("解釈できない入力(指数表記等)は入力エラーが表示され、結果は表示されない(issue #8)", async () => {
		await enterTarget(fixtureData, "iron-plate", "1e-7");

		screen.getByRole("alert");
		expect(screen.queryByRole("table")).toBeNull();
		expect(screen.queryByRole("list", { name: "原料合計" })).toBeNull();
	});

	it("計画結果に接続図(フローグラフ)が SVG で表示される(issue #18)", async () => {
		await enterTarget(fixtureData, "reinforced-iron-plate", "5");

		const figure = await screen.findByRole("figure", { name: "接続図" });
		await waitFor(() => expect(figure.querySelector("svg")).not.toBeNull());
	});

	it("副産物が出るチェーンでは余剰(byproducts)が表示される", async () => {
		// 原油 3 → プラスチック 2 + 廃重油 1 のミニ fixture(実データの Recipe_Plastic_C を模す)
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
		};
		await enterTarget(byproductData, "plastic", "20");

		const byproducts = screen.getByRole("list", { name: "余剰（副産物）" });
		within(byproducts).getByText("廃重油: 10 /分");
		// 需要側(原料)は相殺されず全量のまま
		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("原油: 30 /分");
	});
});

// issue #20: 必要発電機リスト — 総電力を賄う発電機の台数と燃料を一覧で出す。
// 算出そのものは tests/spec/generator-plan.test.ts(純関数)が固定する。
describe("必要発電機リスト(issue #20)", () => {
	it("計画を表示したとき、必要発電機の一覧に種別ごとの台数と必要燃料が表示される", async () => {
		// 鉄板 30/分 → 総電力 12MW
		await enterTarget(generatorFixtureData, "iron-plate", "30");

		// 機械一覧と区別できるよう、発電機の表には名前を付ける
		const table = screen.getByRole("table", { name: "必要発電機" });

		const coalRow = within(table).getByText("石炭発電機").closest("tr");
		expect(coalRow).not.toBeNull();
		// ceil(12 ÷ 75) = 1 台。燃料は実負荷ベース: 石炭 12×60÷300 = 2.4、水 12×60×0.01 = 7.2
		within(coalRow as HTMLElement).getByText("1 台");
		within(coalRow as HTMLElement).getByText(/2\.4 \/分/);
		within(coalRow as HTMLElement).getByText(/7\.2 \/分/);
		expect(coalRow?.textContent).toContain("石炭");
		expect(coalRow?.textContent).toContain("水");

		const fuelRow = within(table).getByText("燃料式発電機").closest("tr");
		expect(fuelRow).not.toBeNull();
		// ceil(12 ÷ 250) = 1 台、燃料 12×60÷750 = 0.96
		within(fuelRow as HTMLElement).getByText("1 台");
		within(fuelRow as HTMLElement).getByText(/0\.96 \/分/);
	});

	it("総電力 0 の計画では、必要発電機のセクションが表示されない", async () => {
		// 鉄鉱石は原料(レシピを持たない)なので機械が要らず、総電力が 0 になる
		await enterTarget(generatorFixtureData, "iron-ore", "30");

		screen.getByText("総電力: 0 MW");
		expect(screen.queryByRole("table", { name: "必要発電機" })).toBeNull();
	});

	it("発電機を持たないレシピデータでは、必要発電機のセクションが表示されない", async () => {
		// 空の表を出すと「発電機ゼロ台で足りる」と読めてしまうため出さない
		await enterTarget(fixtureData, "iron-plate", "30");

		expect(screen.queryByRole("table", { name: "必要発電機" })).toBeNull();
	});
});

// issue #21: 建設コスト — 建設台数(切り上げ)に基づく建設素材の合計を表示する。
// 合算そのものは tests/spec/construction.test.ts(純関数)が固定する。
describe("建設コストの表示(issue #21)", () => {
	it("計画を表示したとき、建設コストに切り上げ台数ベースの素材合計が表示される", async () => {
		// 鉄板 30/分 → 構築機 1.5 台(建設 2)・製錬炉 1.5 台(建設 2)。
		// 構築機 2 台 = 強化鉄板 4 + 鉄のロッド 16、製錬炉 2 台 = 鉄のロッド 10
		await enterTarget(generatorFixtureData, "iron-plate", "30");

		const costs = screen.getByRole("list", {
			name: "建設コスト（機械・採取設備分）",
		});
		within(costs).getByText("強化鉄板: 4 個");
		within(costs).getByText("鉄のロッド: 26 個");
	});

	it("必要発電機の表に、種別ごとの建設コストが表示される", async () => {
		// 発電機は「石炭なら n 台 / 燃料式なら m 台」の代替案なので、コストも種別ごとに併記する
		await enterTarget(generatorFixtureData, "iron-plate", "30");

		const table = screen.getByRole("table", { name: "必要発電機" });

		// 石炭発電機 1 台 = 強化鉄板 20 + 鉄のロッド 10
		const coalRow = within(table).getByText("石炭発電機").closest("tr");
		expect(coalRow?.textContent).toContain("強化鉄板: 20 個");
		expect(coalRow?.textContent).toContain("鉄のロッド: 10 個");

		// 燃料式発電機 1 台 = 鉄板 15 + ネジ 50
		const fuelRow = within(table).getByText("燃料式発電機").closest("tr");
		expect(fuelRow?.textContent).toContain("鉄板: 15 個");
		expect(fuelRow?.textContent).toContain("ネジ: 50 個");
	});

	it("原料だけの計画では、建設コストが表示されない", async () => {
		// 鉄鉱石は原料(レシピを持たない)なので機械が要らず、建てるものが無い
		await enterTarget(generatorFixtureData, "iron-ore", "30");

		expect(
			screen.queryByRole("list", { name: "建設コスト（機械・採取設備分）" }),
		).toBeNull();
	});
});

// issue #23: 採取設備を計画に含める — 原料の採取に要る設備の台数・電力を表示し、
// 総電力と建設コストに反映する。算出そのものは tests/spec/extractor-plan.test.ts
// (純関数)が固定する。
// 採取設備入りのローカル fixture を使うのは、共有 fixture に足すと総電力・建設コストを
// 約束にしている上の既存テストの期待値が動くため。
// 精製機 1 台 = 鉄インゴット 40/分・鉄鉱石 60/分・水 45 m³/分・窒素ガス 10/分 になる値にしてある
const extractorFixtureData: RecipeData = {
	items: {
		water: { name: "水", form: "liquid" },
		"iron-ore": { name: "鉄鉱石" },
		"iron-ingot": { name: "鉄インゴット" },
		"nitrogen-gas": { name: "窒素ガス", form: "gas" },
		"iron-rod": { name: "鉄のロッド" },
		"reinforced-iron-plate": { name: "強化鉄板" },
		coal: { name: "石炭" },
	},
	buildings: {
		refinery: {
			name: "精製機",
			powerMW: 30,
			constructionCost: [{ item: "iron-rod", amount: 20 }],
		},
	},
	recipes: [
		{
			id: "iron-ingot",
			name: "鉄インゴット",
			building: "refinery",
			durationSeconds: 6,
			alternate: false,
			inputs: [
				{ item: "iron-ore", amount: 6 },
				{ item: "water", amount: "4.5" },
				// 窒素ガスは資源井でしか採れない = 採取設備を持たない原料の代表
				{ item: "nitrogen-gas", amount: 1 },
			],
			outputs: [{ item: "iron-ingot", amount: 4 }],
		},
	],
	// 定格 15MW にしてあるので、採取分を足すかどうかで必要台数が 2 台 / 3 台と変わる
	generators: [
		{
			id: "coal-generator",
			name: "石炭発電機",
			powerMW: 15,
			fuels: [{ item: "coal", energyMJ: 300 }],
			constructionCost: [{ item: "iron-rod", amount: 10 }],
		},
	],
	extractors: [
		{
			id: "Build_WaterPump_C",
			name: "Water Extractor",
			nameJa: "揚水ポンプ",
			powerMW: 20,
			ratePerMinute: 120,
			resources: ["water"],
			constructionCost: [{ item: "reinforced-iron-plate", amount: 10 }],
		},
		// 鉄鉱石は Mk.1 でも採れるが、仮定は Mk.2(issue #23)
		{
			id: "Build_MinerMk1_C",
			name: "Miner Mk.1",
			nameJa: "採鉱機 Mk.1",
			powerMW: 5,
			ratePerMinute: 60,
			resources: ["iron-ore"],
			constructionCost: [{ item: "iron-rod", amount: 10 }],
		},
		{
			id: "Build_MinerMk2_C",
			name: "Miner Mk.2",
			nameJa: "採鉱機 Mk.2",
			powerMW: 15,
			ratePerMinute: 120,
			resources: ["iron-ore"],
			constructionCost: [{ item: "iron-rod", amount: 30 }],
		},
	],
};

describe("採取設備の表示(issue #23)", () => {
	it("水を要求する計画のとき、採取設備の表に揚水ポンプの台数（端数 + 建設台数）と電力が表示される", async () => {
		await enterTarget(extractorFixtureData, "iron-ingot", "40");

		// 機械一覧・必要発電機と区別できるよう、採取設備の表には名前を付ける
		const table = screen.getByRole("table", { name: "採取設備" });
		const waterRow = within(table).getByText("水").closest("tr");
		expect(waterRow).not.toBeNull();
		within(waterRow as HTMLElement).getByText("揚水ポンプ");
		// 水 45 m³/分 ÷ 120 = 0.375 台、20MW × 0.375 = 7.5MW
		within(waterRow as HTMLElement).getByText("0.375 台（建設 1 台）");
		within(waterRow as HTMLElement).getByText("7.5 MW");
	});

	it("固体資源では、採鉱機 Mk.2 を仮定した台数と電力が表示される", async () => {
		await enterTarget(extractorFixtureData, "iron-ingot", "40");

		const table = screen.getByRole("table", { name: "採取設備" });
		const oreRow = within(table).getByText("鉄鉱石").closest("tr");
		expect(oreRow).not.toBeNull();
		within(oreRow as HTMLElement).getByText("採鉱機 Mk.2");
		// 鉄鉱石 60/分 ÷ 120 = 0.5 台、15MW × 0.5 = 7.5MW
		within(oreRow as HTMLElement).getByText("0.5 台（建設 1 台）");
		within(oreRow as HTMLElement).getByText("7.5 MW");
		// 候補が複数あっても行は資源 1 つにつき 1 行(Mk.1 は使わない)
		expect(within(table).queryByText("採鉱機 Mk.1")).toBeNull();
	});

	it("採取設備を持たない原料は、採取設備の表に行が出ない", async () => {
		// 窒素ガスは資源井でしか採れない。原料としては従来どおり量だけ表示する
		await enterTarget(extractorFixtureData, "iron-ingot", "40");

		const table = screen.getByRole("table", { name: "採取設備" });
		expect(within(table).queryByText("窒素ガス")).toBeNull();
		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("窒素ガス: 10 /分");
	});

	it("採取設備を要する計画のとき、総電力が製造分と採取分の合算で表示される", async () => {
		await enterTarget(extractorFixtureData, "iron-ingot", "40");

		// 製造 30MW(精製機 1 台)+ 採取 15MW(揚水ポンプ 7.5 + 採鉱機 7.5)。
		// 書式そのものは約束しないので、合算値と内訳が読めることだけを固定する
		const total = screen.getByText(/総電力/);
		expect(total.textContent).toMatch(/総電力[:：]\s*45 MW/);
		expect(total.textContent).toMatch(/製造\s*30 MW/);
		expect(total.textContent).toMatch(/採取\s*15 MW/);
	});

	it("採取設備が要らない計画では、総電力に内訳が併記されない", async () => {
		// 「製造 12 MW + 採取 0 MW」と書くと、採取が要る計画との区別が付かなくなる
		await enterTarget(generatorFixtureData, "iron-plate", "30");

		screen.getByText("総電力: 12 MW");
		expect(screen.queryByRole("table", { name: "採取設備" })).toBeNull();
	});

	it("必要発電機の台数と燃料が、採取分を含めた総電力から計算される", async () => {
		await enterTarget(extractorFixtureData, "iron-ingot", "40");

		const table = screen.getByRole("table", { name: "必要発電機" });
		const coalRow = within(table).getByText("石炭発電機").closest("tr");
		expect(coalRow).not.toBeNull();
		// ceil(45 ÷ 15) = 3 台(製造分 30MW だけなら 2 台)、燃料 45×60÷300 = 9/分
		within(coalRow as HTMLElement).getByText("3 台");
		within(coalRow as HTMLElement).getByText(/9 \/分/);
	});

	it("建設コストに採取設備分が合算される", async () => {
		// 欠落を許すと建設コストが黙って過少表示される(issue #21 と同じ理由)
		await enterTarget(extractorFixtureData, "iron-ingot", "40");

		// 精製機 1 台(鉄のロッド 20)+ 採鉱機 Mk.2 1 台(鉄のロッド 30)= 50、
		// 揚水ポンプ 1 台(強化鉄板 10)
		const costs = screen.getByRole("list", {
			name: "建設コスト（機械・採取設備分）",
		});
		within(costs).getByText("鉄のロッド: 50 個");
		within(costs).getByText("強化鉄板: 10 個");
	});
});

// issue #48: アイテムを選んだ時点で「まず 1 台分」の計画が出るようにする。
// 1 台分レートの算出そのものは tests/spec/machine-rate.test.ts(純関数)が固定する。
describe("1 台分レートの自動入力(issue #48)", () => {
	it("primary レシピを持つアイテムを選択したとき、目標レート欄に 1 台分のレートが入力され、計画が表示される", async () => {
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-plate");

		// 鉄板は 6 秒で 2 枚 → 構築機 1 台で 20/分
		expect(screen.getByLabelText<HTMLInputElement>(/目標レート/).value).toBe(
			"20",
		);
		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("鉄鉱石: 30 /分");
		screen.getByText("総電力: 8 MW");
	});

	it("自動入力された値を書き換えたとき、書き換えた値で計画が再計算される", async () => {
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-plate");
		const rateInput = screen.getByLabelText<HTMLInputElement>(/目標レート/);
		// 「自動入力された値を」書き換える筋書きなので、書き換え前の値も押さえる
		expect(rateInput.value).toBe("20");
		await user.clear(rateInput);
		await user.type(rateInput, "30");

		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("鉄鉱石: 45 /分");
	});

	it("原料を選択したとき、目標レート欄は変更されない", async () => {
		// 原料には「1 台分」が無い。既定値(例: 60)を入れるとその値が根拠のある
		// レートに見えてしまうため、空のままにすると決めた(issue #48)
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-ore");

		expect(screen.getByLabelText<HTMLInputElement>(/目標レート/).value).toBe(
			"",
		);
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("レート入力済みの状態で原料に切り替えたとき、目標レート欄の値は保持される", async () => {
		// 消してしまうと、原料を覗いた後に元のアイテムへ戻すたび入力し直しになる
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-plate");
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-ore");

		expect(screen.getByLabelText<HTMLInputElement>(/目標レート/).value).toBe(
			"20",
		);
	});

	it("別アイテムに切り替えたとき、目標レート欄は新アイテムの 1 台分レートで上書きされる", async () => {
		// 手入力後は上書きしない案もあったが、挙動の予測しやすさを優先して常に上書きする(issue #48)
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-plate");
		const rateInput = screen.getByLabelText(/目標レート/);
		await user.clear(rateInput);
		await user.type(rateInput, "30");
		await user.selectOptions(screen.getByLabelText("アイテム"), "screw");

		// ネジは 6 秒で 4 個 → 40/分
		expect(screen.getByLabelText<HTMLInputElement>(/目標レート/).value).toBe(
			"40",
		);
	});
});
