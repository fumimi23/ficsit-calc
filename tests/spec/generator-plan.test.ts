// issue #20: 必要発電機リスト — 総電力から発電機種別ごとの必要台数と必要燃料を出す。
// 受け入れ条件(台数は切り上げ / 燃料と副資材は実負荷ベース / 総電力 0 なら 0)を
// 純関数の約束として固定する。fixture は tests/fixtures/recipes.ts の発電機入り版。
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import { planGenerators } from "../../src/lib/calc/generators";
import type { RecipeData } from "../../src/lib/calc/types";
import { generatorFixtureData } from "../fixtures/recipes";

// ExactNumeric / Fraction の内部表現は約束しないので、既約分数の文字列で突き合わせる
// (Fraction は正規化済みなので equals と同値。失敗時に値が読めるぶんこちらを使う)
function expectRate(actual: Fraction | undefined, expected: string): void {
	expect(actual?.toString()).toBe(Fraction.from(expected).toString());
}

const requirementsFor = (data: RecipeData, totalPowerMW: string) =>
	planGenerators(data, Fraction.from(totalPowerMW));

describe("必要発電機の算出(issue #20)", () => {
	it("総電力 300MW のとき、石炭発電機は 4 台・石炭 60/分・水 180/分になる", () => {
		const requirements = requirementsFor(generatorFixtureData, "300");
		const coal = requirements.find((r) => r.generator === "coal-generator");

		// ceil(300 ÷ 75) = 4
		expect(coal?.count).toBe(4n);
		// 燃料・副資材は台数×定格ではなく実負荷(総電力)から出す
		expect(coal?.fuelOptions).toHaveLength(1);
		expect(coal?.fuelOptions[0]?.fuel.item).toBe("coal");
		expectRate(coal?.fuelOptions[0]?.fuel.ratePerMinute, "60");
		expect(coal?.fuelOptions[0]?.supplemental?.item).toBe("water");
		expectRate(coal?.fuelOptions[0]?.supplemental?.ratePerMinute, "180");
	});

	it("総電力 300MW のとき、燃料式発電機は 2 台・燃料 24/分になり、副資材は付かない", () => {
		const requirements = requirementsFor(generatorFixtureData, "300");
		const fuel = requirements.find((r) => r.generator === "fuel-generator");

		// ceil(300 ÷ 250) = 2
		expect(fuel?.count).toBe(2n);
		expect(fuel?.fuelOptions[0]?.fuel.item).toBe("fuel");
		expectRate(fuel?.fuelOptions[0]?.fuel.ratePerMinute, "24");
		expect(fuel?.fuelOptions[0]?.supplemental).toBeUndefined();
	});

	it("総電力 0 のとき、すべての発電機の必要台数と燃料レートが 0 になる", () => {
		const requirements = requirementsFor(generatorFixtureData, "0");

		// 行が消えるのではなく 0 の行が並ぶ(表示するかどうかは UI の判断)
		expect(requirements).toHaveLength(generatorFixtureData.generators.length);
		for (const requirement of requirements) {
			expect(requirement.count).toBe(0n);
			for (const option of requirement.fuelOptions) {
				expectRate(option.fuel.ratePerMinute, "0");
				if (option.supplemental) {
					expectRate(option.supplemental.ratePerMinute, "0");
				}
			}
		}
	});

	it("複数の燃料を燃やせる発電機では、燃料ごとに必要レートが並記される", () => {
		// 未決事項の決定(issue #20): 代表燃料 1 種に畳まず燃料別に併記する
		const multiFuelData: RecipeData = {
			...generatorFixtureData,
			items: {
				...generatorFixtureData.items,
				coke: { name: "石油コークス" },
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
							supplemental: { item: "water", amountPerMJ: "0.01" },
						},
						{
							item: "coke",
							energyMJ: 180,
							supplemental: { item: "water", amountPerMJ: "0.01" },
						},
					],
				},
			],
		};

		const requirements = requirementsFor(multiFuelData, "300");
		const coal = requirements.find((r) => r.generator === "coal-generator");

		// 台数は燃料に依らず 1 つ(どの燃料で賄っても同じ設備)
		expect(coal?.count).toBe(4n);
		expect(coal?.fuelOptions.map((o) => o.fuel.item)).toEqual(["coal", "coke"]);
		expectRate(coal?.fuelOptions[0]?.fuel.ratePerMinute, "60");
		// 300MW × 60 ÷ 180MJ = 100/分
		expectRate(coal?.fuelOptions[1]?.fuel.ratePerMinute, "100");
		// 副資材は燃料に依らず発電量比例なのでどちらも同じ
		expectRate(coal?.fuelOptions[1]?.supplemental?.ratePerMinute, "180");
	});
});
