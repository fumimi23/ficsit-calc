// issue #23 受け入れ条件 1: 採取設備のスキーマ検証が「正の値(採取レート・消費電力)」と
// 「参照整合性(対象資源が辞書に存在)」を検査する、を固定する。
// 収録内容(どの設備が入っているか)は invariants の担当なので、ここは構造だけを見る
// —— 空の extractors は通す。エラー文言は約束しない(toThrow に引数を渡さない)。
import { describe, expect, it } from "vitest";
import type { ExtractorDef } from "../../src/lib/calc/types";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { generatorFixtureData } from "../fixtures/recipes";

/** 正しい揚水ポンプの定義を作り、検査したい 1 点だけを壊せるようにする */
const waterPump = (override: Partial<ExtractorDef> = {}): ExtractorDef => ({
	id: "Build_WaterPump_C",
	name: "Water Extractor",
	nameJa: "揚水ポンプ",
	powerMW: 20,
	ratePerMinute: 120,
	resources: ["water"],
	constructionCost: [
		{ item: "reinforced-iron-plate", amount: 10 },
		{ item: "iron-rod", amount: 10 },
	],
	...override,
});

const withExtractors = (extractors: unknown): unknown => ({
	...generatorFixtureData,
	extractors,
});

/** extractors キーごと欠けたデータ(採取設備を知らない古い recipes.json を読んだ状況) */
const withoutExtractors = (): unknown => {
	const data: Record<string, unknown> = { ...generatorFixtureData };
	delete data.extractors;
	return data;
};

describe("採取設備のスキーマ検証(issue #23)", () => {
	it("採取設備を含むデータは、そのままではスキーマ検証を通る", () => {
		expect(() =>
			validateRecipeData(withExtractors([waterPump()])),
		).not.toThrow();
	});

	it("extractors が無いとき、スキーマ検証がエラーになる", () => {
		expect(() => validateRecipeData(withoutExtractors())).toThrow();
	});

	it("採取設備が 1 つも無い(空配列の)とき、スキーマ検証は通る", () => {
		// 収録漏れは invariants が落とす。ここで落とすと採取設備を持たない
		// ローカル fixture がすべて検証を通らなくなる
		expect(() => validateRecipeData(withExtractors([]))).not.toThrow();
	});

	it("対象資源がアイテム辞書に無いとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(
				withExtractors([waterPump({ resources: ["unobtainium"] })]),
			),
		).toThrow();
	});

	it("対象資源が 1 つも無いとき、スキーマ検証がエラーになる", () => {
		// 何も採れない採取設備は計画に出しようがなく、収録されていること自体が異常
		expect(() =>
			validateRecipeData(withExtractors([waterPump({ resources: [] })])),
		).toThrow();
	});

	it("消費電力・採取レートが正でないとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(withExtractors([waterPump({ powerMW: 0 })])),
		).toThrow();
		expect(() =>
			validateRecipeData(
				withExtractors([waterPump({ ratePerMinute: "-120" })]),
			),
		).toThrow();
		// レート 0 は必要台数が 0 除算になる
		expect(() =>
			validateRecipeData(withExtractors([waterPump({ ratePerMinute: 0 })])),
		).toThrow();
	});

	it("採取設備の建設素材が無い、または空のとき、スキーマ検証がエラーになる", () => {
		// 欠落を許すと建設コストが黙って過少表示される(issue #21 と同じ理由)
		const { constructionCost: _dropped, ...withoutCost } = waterPump();
		expect(() => validateRecipeData(withExtractors([withoutCost]))).toThrow();
		expect(() =>
			validateRecipeData(withExtractors([waterPump({ constructionCost: [] })])),
		).toThrow();
	});

	it("採取設備 ID が重複するとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(withExtractors([waterPump(), waterPump()])),
		).toThrow();
	});
});
