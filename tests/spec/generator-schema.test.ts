// issue #20 受け入れ条件 1: 発電機のスキーマ検証が「正の値」と「参照整合性
// (燃料アイテムが辞書に存在)」を検査する、を固定する。
// エラー文言は約束しない(toThrow に引数を渡さない)。
import { describe, expect, it } from "vitest";
import type { GeneratorDef } from "../../src/lib/calc/types";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { generatorFixtureData } from "../fixtures/recipes";

/** 正しい石炭発電機の定義を作り、検査したい 1 点だけを壊せるようにする */
const coalGenerator = (override: Partial<GeneratorDef> = {}): GeneratorDef => ({
	id: "coal-generator",
	name: "石炭発電機",
	powerMW: 75,
	fuels: [
		{
			item: "coal",
			energyMJ: 300,
			supplemental: { item: "water", amountPerMJ: "0.01" },
		},
	],
	...override,
});

const withGenerators = (generators: unknown): unknown => ({
	...generatorFixtureData,
	generators,
});

describe("発電機のスキーマ検証(issue #20)", () => {
	it("発電機を含むデータは、そのままではスキーマ検証を通る", () => {
		expect(() => validateRecipeData(generatorFixtureData)).not.toThrow();
	});

	it("燃料または副資材のアイテムがアイテム辞書に無いとき、スキーマ検証がエラーになる", () => {
		const unknownFuel = coalGenerator({
			fuels: [{ item: "unobtainium", energyMJ: 300 }],
		});
		expect(() => validateRecipeData(withGenerators([unknownFuel]))).toThrow();

		const unknownSupplemental = coalGenerator({
			fuels: [
				{
					item: "coal",
					energyMJ: 300,
					supplemental: { item: "heavy-water", amountPerMJ: "0.01" },
				},
			],
		});
		expect(() =>
			validateRecipeData(withGenerators([unknownSupplemental])),
		).toThrow();
	});

	it("定格出力・エネルギー値・副資材比率が正でないとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(withGenerators([coalGenerator({ powerMW: 0 })])),
		).toThrow();

		expect(() =>
			validateRecipeData(
				withGenerators([
					coalGenerator({ fuels: [{ item: "coal", energyMJ: 0 }] }),
				]),
			),
		).toThrow();

		expect(() =>
			validateRecipeData(
				withGenerators([
					coalGenerator({
						fuels: [
							{
								item: "coal",
								energyMJ: 300,
								supplemental: { item: "water", amountPerMJ: "-0.01" },
							},
						],
					}),
				]),
			),
		).toThrow();
	});

	it("燃料が 1 つも無い発電機があるとき、スキーマ検証がエラーになる", () => {
		// 燃料の無い発電機は必要燃料を出せず、リストに載せる意味が無い
		expect(() =>
			validateRecipeData(withGenerators([coalGenerator({ fuels: [] })])),
		).toThrow();
	});
});
