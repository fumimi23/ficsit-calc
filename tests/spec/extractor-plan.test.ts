// issue #23: 採取設備を計画に含める — 原料合計から採取設備の必要台数と電力を出す
// 純関数の約束を固定する。受け入れ条件「台数・電力の算出は純関数として spec テストで
// 固定される」に対応。
// ノード純度は「普通」・固体資源は採鉱機 Mk.2 という仮定もここで固定する
// (純度・マークを選ばせる設定 UI はフォローアップ issue)。
import { describe, expect, it } from "vitest";
import {
	planExtractors,
	sumExtractorPowerMW,
} from "../../src/lib/calc/extractors";
import { Fraction } from "../../src/lib/calc/fraction";
import type { ItemRate, RecipeData } from "../../src/lib/calc/types";

// Fraction の内部表現は約束しないので、既約分数の文字列で突き合わせる
// (失敗時に値が読めるぶん equals よりこちらを使う)。
// expected は十進表記で渡す: Fraction.from は分数表記("3/8")を受理しない(issue #8)
function expectValue(actual: Fraction | undefined, expected: string): void {
	expect(actual?.toString()).toBe(Fraction.from(expected).toString());
}

const rates = (entries: [string, string][]): ItemRate[] =>
	entries.map(([item, ratePerMinute]) => ({
		item,
		ratePerMinute: Fraction.from(ratePerMinute),
	}));

// 採取設備入りのローカル fixture。共有 fixture(tests/fixtures/recipes.ts)に足さないのは、
// 総電力・建設コストを約束にしている既存 UI テストの期待値が動いてしまうため。
// 採鉱機の id は「既定は Mk.2」の選択規則がかかる対象なので、実データと同じ ClassName を使う。
// 窒素ガスは資源井でしか採れない = 採取設備を持たない資源の代表。
const extractorData: RecipeData = {
	items: {
		water: { name: "水", form: "liquid" },
		"iron-ore": { name: "鉄鉱石" },
		coal: { name: "石炭" },
		"nitrogen-gas": { name: "窒素ガス", form: "gas" },
		"iron-rod": { name: "鉄のロッド" },
	},
	buildings: {},
	recipes: [],
	generators: [],
	extractors: [
		{
			id: "Build_WaterPump_C",
			name: "Water Extractor",
			nameJa: "揚水ポンプ",
			powerMW: 20,
			ratePerMinute: 120,
			resources: ["water"],
			constructionCost: [{ item: "iron-rod", amount: 10 }],
		},
		{
			id: "Build_MinerMk1_C",
			name: "Miner Mk.1",
			nameJa: "採鉱機 Mk.1",
			powerMW: 5,
			ratePerMinute: 60,
			resources: ["coal", "iron-ore"],
			constructionCost: [{ item: "iron-rod", amount: 10 }],
		},
		{
			id: "Build_MinerMk2_C",
			name: "Miner Mk.2",
			nameJa: "採鉱機 Mk.2",
			powerMW: 15,
			ratePerMinute: 120,
			resources: ["coal", "iron-ore"],
			constructionCost: [{ item: "iron-rod", amount: 20 }],
		},
		{
			id: "Build_MinerMk3_C",
			name: "Miner Mk.3",
			nameJa: "採鉱機 Mk.3",
			powerMW: 45,
			ratePerMinute: 240,
			resources: ["coal", "iron-ore"],
			constructionCost: [{ item: "iron-rod", amount: 30 }],
		},
	],
};

describe("採取設備の算出(issue #23)", () => {
	it("原料が採取設備 1 台分ちょうどのとき、必要台数 1 台・電力は定格になる", () => {
		const requirements = planExtractors(
			extractorData,
			rates([["water", "120"]]),
		);

		expect(requirements).toHaveLength(1);
		expect(requirements[0]?.item).toBe("water");
		expect(requirements[0]?.extractor).toBe("Build_WaterPump_C");
		expectValue(requirements[0]?.count, "1");
		expectValue(requirements[0]?.powerMW, "20");
	});

	it("原料が採取設備 1 台分に満たないとき、台数は端数のまま・電力も端数に比例する", () => {
		// 45 ÷ 120 = 0.375 台。建設台数への切り上げは表示側の関心事なので、ここでは丸めない
		const requirements = planExtractors(
			extractorData,
			rates([["water", "45"]]),
		);

		expectValue(requirements[0]?.count, "0.375");
		// 20MW × 0.375 = 7.5MW(端数の 1 台は部分負荷で回る)
		expectValue(requirements[0]?.powerMW, "7.5");
	});

	it("同じ資源を採れる設備が複数あるとき、採鉱機 Mk.2 を仮定した台数と電力になる", () => {
		// 未決事項の決定(issue #23): 純度「普通」・固体資源は Mk.2 固定。仮定は UI に明示する
		const requirements = planExtractors(
			extractorData,
			rates([["iron-ore", "60"]]),
		);

		expect(requirements[0]?.extractor).toBe("Build_MinerMk2_C");
		// 60 ÷ 120 = 0.5 台、15MW × 0.5 = 7.5MW
		expectValue(requirements[0]?.count, "0.5");
		expectValue(requirements[0]?.powerMW, "7.5");
	});

	it("候補が複数あるのに既定の採鉱機が無いとき、エラーになる", () => {
		// どれを使うか決められないまま先頭を採ると、台数・電力が黙って別物になる
		const withoutAssumedMiner: RecipeData = {
			...extractorData,
			extractors: extractorData.extractors.filter(
				(extractor) => extractor.id !== "Build_MinerMk2_C",
			),
		};

		expect(() =>
			planExtractors(withoutAssumedMiner, rates([["iron-ore", "60"]])),
		).toThrow();
	});

	it("採取設備を持たない資源のとき、その資源の行は出ない", () => {
		// 窒素ガスは資源井でしか採れない。0 台の行を出すと「設備なしで採れる」と読めてしまう
		expect(
			planExtractors(extractorData, rates([["nitrogen-gas", "60"]])),
		).toEqual([]);
	});

	it("複数の原料があるとき、原料合計の並び順のまま採取設備が並ぶ", () => {
		const requirements = planExtractors(
			extractorData,
			rates([
				["coal", "240"],
				["nitrogen-gas", "30"],
				["water", "45"],
				["iron-ore", "60"],
			]),
		);

		expect(requirements.map((r) => r.item)).toEqual([
			"coal",
			"water",
			"iron-ore",
		]);
		// 石炭 240 ÷ 120 = 2 台(採鉱機 Mk.2)、15MW × 2 = 30MW
		expectValue(requirements[0]?.count, "2");
		expectValue(requirements[0]?.powerMW, "30");
	});

	it("原料が 1 つも無いとき、空配列を返す", () => {
		expect(planExtractors(extractorData, [])).toEqual([]);
	});
});

describe("採取設備の合計電力(issue #23)", () => {
	it("採取設備が複数あるとき、電力の合計が返る", () => {
		// 揚水ポンプ 7.5MW + 採鉱機 Mk.2 7.5MW = 15MW
		const requirements = planExtractors(
			extractorData,
			rates([
				["water", "45"],
				["iron-ore", "60"],
			]),
		);

		expectValue(sumExtractorPowerMW(requirements), "15");
	});

	it("採取設備が 1 つも無いとき、合計電力は 0 になる", () => {
		expectValue(sumExtractorPowerMW([]), "0");
	});
});
