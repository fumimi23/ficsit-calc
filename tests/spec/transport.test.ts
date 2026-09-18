// issue #35 受け入れ条件 2・3: 流量を 1 本で運べる最低の Mk を選ぶ純関数の約束を固定する。
// 固体はベルト、液体・気体はパイプの表を見る。上限ちょうどは 1 本で運べるものとして扱い、
// 最大 Mk でも 1 本に収まらなければ最大 Mk の必要本数で表す。
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import { selectTransport } from "../../src/lib/calc/transport";
import type { ItemId, RecipeData } from "../../src/lib/calc/types";
import { fixtureData } from "../fixtures/recipes";

// fixtureData のアイテムはすべて form 未指定(= 固体扱い)なので、液体・気体だけ足す
const transportData: RecipeData = {
	...fixtureData,
	items: {
		...fixtureData.items,
		water: { name: "水", form: "liquid" },
		"nitrogen-gas": { name: "窒素ガス", form: "gas" },
	},
};

const withoutTransports: RecipeData = {
	...transportData,
	belts: [],
	pipes: [],
};

/** 選ばれた段と本数だけを取り出す(段の中身の正しさは docs-parser / invariants の担当) */
const selected = (item: ItemId, ratePerMinute: Fraction) => {
	const requirement = selectTransport(transportData, item, ratePerMinute);
	return requirement === undefined
		? undefined
		: { tier: requirement.transport.tier, lines: requirement.lines };
};

const at = (item: ItemId, ratePerMinute: number) =>
	selected(item, Fraction.of(ratePerMinute));

describe("搬送設備の選定(issue #35)", () => {
	it("固体の流量が 360 /分 のとき、1 本で運べる最低の段としてベルト Mk.4 が選ばれる", () => {
		const requirement = selectTransport(
			transportData,
			"iron-ingot",
			Fraction.of(360),
		);

		expect(requirement?.transport.id).toBe("Build_ConveyorBeltMk4_C");
		expect(requirement?.transport.tier).toBe(4);
		expect(requirement?.lines).toBe(1);
	});

	it("固体の流量が段の上限ちょうどのとき、その段が 1 本で選ばれる", () => {
		// 上限ちょうどを「次の段が要る」と判定すると Mk.1 で足りる 60 /分 が Mk.2 になる
		expect(at("iron-ingot", 60)).toEqual({ tier: 1, lines: 1 });
		expect(at("iron-ingot", 1200)).toEqual({ tier: 6, lines: 1 });
	});

	it("固体の流量が段の上限を超えるとき、1 つ上の段が選ばれる", () => {
		expect(at("iron-ingot", 45)).toEqual({ tier: 1, lines: 1 });
		expect(at("iron-ingot", 61)).toEqual({ tier: 2, lines: 1 });
	});

	it("固体の流量が最大 Mk の上限を超えるとき、最大 Mk と必要本数になる", () => {
		expect(at("iron-ingot", 1201)).toEqual({ tier: 6, lines: 2 });
		// 上限の丁度 2 倍は 2 本(切り上げが 1 本ぶん余計に増えない)
		expect(at("iron-ingot", 2400)).toEqual({ tier: 6, lines: 2 });
		expect(at("iron-ingot", 2401)).toEqual({ tier: 6, lines: 3 });
	});

	it("上限を分数ぶんだけ超える流量のとき、近似せずに本数が繰り上がる", () => {
		// 1200 + 10^-18。toNumber() で比較すると倍精度では 1200 に丸まって 1 本になる
		const justOver = Fraction.of(1200).add(Fraction.of(1n, 10n ** 18n));

		expect(selected("iron-ingot", justOver)).toEqual({ tier: 6, lines: 2 });
	});

	it("液体の流量のとき、ベルトではなくパイプの段が選ばれる", () => {
		// 301 /分 は固体ならベルト Mk.4、液体ならパイプ Mk.2。表を取り違えると段が変わる
		expect(at("water", 300)).toEqual({ tier: 1, lines: 1 });
		expect(at("water", 301)).toEqual({ tier: 2, lines: 1 });
		expect(at("water", 600)).toEqual({ tier: 2, lines: 1 });
		expect(at("iron-ingot", 301)).toEqual({ tier: 4, lines: 1 });
	});

	it("気体の流量のとき、液体と同じくパイプの段が選ばれる", () => {
		expect(at("nitrogen-gas", 30)).toEqual({ tier: 1, lines: 1 });
		expect(at("nitrogen-gas", 601)).toEqual({ tier: 2, lines: 2 });
	});

	it("液体の流量が最大 Mk の上限を超えるとき、パイプ Mk.2 の必要本数になる", () => {
		expect(at("water", 601)).toEqual({ tier: 2, lines: 2 });
		expect(at("water", 3000)).toEqual({ tier: 2, lines: 5 });
	});

	it("物質形態が未指定のアイテムのとき、固体としてベルトの段が選ばれる", () => {
		// 実データは全アイテムに form が入っている。未指定は fixture の省略なので固体扱い
		expect(transportData.items["iron-ore"]?.form).toBeUndefined();
		expect(at("iron-ore", 480)).toEqual({ tier: 4, lines: 1 });
	});

	it("ベルト・パイプが 1 段も収録されていないとき、undefined になる", () => {
		// 搬送設備を知らない古い recipes.json を読んでもエラーにせず、注記なしに縮退させる
		expect(
			selectTransport(withoutTransports, "iron-ingot", Fraction.of(60)),
		).toBeUndefined();
		expect(
			selectTransport(withoutTransports, "water", Fraction.of(60)),
		).toBeUndefined();
	});
});
