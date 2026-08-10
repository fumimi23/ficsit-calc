// issue #6: 計算コアの数値を浮動小数点から正確な分数(有理数)に変更する
// float では 0.1 や 1/3 が近似になり枝の合算で誤差が出るため、
// 分数表現によって「ぴったり一致」を約束として固定する(誤差許容 toBeCloseTo は使わない)。
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import { planProduction } from "../../src/lib/calc/plan";
import { fixtureData } from "../fixtures/recipes";

const frac = (num: number, den = 1) => Fraction.of(num, den);

describe("正確な分数演算(issue #6)", () => {
	it("0.1 や 1/3 が絡むチェーン(強化鉄板 1 個/分)を指定したとき、機械台数・原料量・合計電力が厳密等値で一致する", () => {
		// 台数が 0.3(鉄板)・0.3(ネジ)・0.2(ロッド)・0.4(製錬炉計)と、
		// 二進小数で表現できない値だらけになるケース
		const plan = planProduction(fixtureData, {
			itemId: "reinforced-iron-plate",
			ratePerMinute: 1,
		});

		const ingot = plan.machines.find((m) => m.recipeId === "iron-ingot");
		expect(ingot?.machineCount).toEqual(frac(2, 5));

		expect(plan.rawMaterials).toEqual([
			{ item: "iron-ore", ratePerMinute: frac(12) },
		]);

		// 組立機 1/5×15 + 構築機(3/10 + 3/10 + 1/5)×4 + 製錬炉 2/5×4 = 39/5 MW (= 7.8)
		expect(plan.totalPowerMW).toEqual(frac(39, 5));
	});

	it('目標レートを十進文字列("7.5" 個/分)で指定したとき、正確な分数(15/2)として扱われる', () => {
		const plan = planProduction(fixtureData, {
			itemId: "iron-plate",
			ratePerMinute: "7.5",
		});

		expect(plan.root.ratePerMinute).toEqual(frac(15, 2));
		// 7.5/分 ÷ 20/分(構築機 1 台あたり) = 3/8 台
		expect(plan.root.production?.machineCount).toEqual(frac(3, 8));
	});

	it("計画の数値は指定桁の十進文字列に変換できる(表示用。末尾の 0 は落ちる)", () => {
		const plan = planProduction(fixtureData, {
			itemId: "reinforced-iron-plate",
			ratePerMinute: 1,
		});

		expect(plan.totalPowerMW.toDecimalString(2)).toBe("7.8");
		expect(frac(40, 3).toDecimalString(4)).toBe("13.3333");
		expect(frac(3, 2).toDecimalString(4)).toBe("1.5");
		expect(frac(45).toDecimalString(2)).toBe("45");
	});
});
