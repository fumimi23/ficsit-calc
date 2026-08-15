// issue #21 受け入れ条件 1: 建設素材のスキーマ検証が「必須・非空」「参照整合性
// (素材アイテムが辞書に存在)」「正の数量」を検査する、を固定する。
// constructionCost を optional にしないのはこの検査で欠落を落とすため
// (許すと建設コストが黙って過少表示される)。エラー文言は約束しない。
import { describe, expect, it } from "vitest";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { fixtureData, generatorFixtureData } from "../fixtures/recipes";

/** 検査したい 1 点(建設素材)だけを差し替えられる、他は正しい機械の定義 */
const smelter = (constructionCost: unknown): unknown => ({
	name: "製錬炉",
	powerMW: 4,
	constructionCost,
});

const coalGenerator = (constructionCost: unknown): unknown => ({
	id: "coal-generator",
	name: "石炭発電機",
	powerMW: 75,
	fuels: [{ item: "coal", energyMJ: 300 }],
	constructionCost,
});

const withSmelter = (building: unknown): unknown => ({
	...generatorFixtureData,
	buildings: { ...generatorFixtureData.buildings, smelter: building },
});

const withGenerators = (generators: unknown): unknown => ({
	...generatorFixtureData,
	generators,
});

describe("建設素材のスキーマ検証(issue #21)", () => {
	it("建設素材を持つ fixture は、そのままではスキーマ検証を通る", () => {
		expect(() => validateRecipeData(fixtureData)).not.toThrow();
		expect(() => validateRecipeData(generatorFixtureData)).not.toThrow();
	});

	it("機械の建設素材が無い、または空のとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(withSmelter({ name: "製錬炉", powerMW: 4 })),
		).toThrow();
		expect(() => validateRecipeData(withSmelter(smelter([])))).toThrow();
	});

	it("発電機の建設素材が無い、または空のとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(
				withGenerators([
					{
						id: "coal-generator",
						name: "石炭発電機",
						powerMW: 75,
						fuels: [{ item: "coal", energyMJ: 300 }],
					},
				]),
			),
		).toThrow();
		expect(() =>
			validateRecipeData(withGenerators([coalGenerator([])])),
		).toThrow();
	});

	it("建設素材のアイテムがアイテム辞書に無いとき、スキーマ検証がエラーになる", () => {
		const unknownItem = [{ item: "unobtainium", amount: 5 }];

		expect(() =>
			validateRecipeData(withSmelter(smelter(unknownItem))),
		).toThrow();
		expect(() =>
			validateRecipeData(withGenerators([coalGenerator(unknownItem)])),
		).toThrow();
	});

	it("建設素材の数量が 0 または負のとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(
				withSmelter(smelter([{ item: "iron-rod", amount: 0 }])),
			),
		).toThrow();
		expect(() =>
			validateRecipeData(
				withSmelter(smelter([{ item: "iron-rod", amount: "-5" }])),
			),
		).toThrow();
		// 正の数量なら同じ形が通る(落ちる理由が数量だけだと確かめる)
		expect(() =>
			validateRecipeData(
				withSmelter(smelter([{ item: "iron-rod", amount: 5 }])),
			),
		).not.toThrow();
	});
});
