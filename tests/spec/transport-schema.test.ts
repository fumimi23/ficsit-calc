// issue #35 受け入れ条件 1: 搬送設備(ベルト・パイプ)のスキーマ検証が
// 「配列であること」「ID の一意性」「正の値(段・送量)」を検査する、を固定する。
// 収録内容(どの段が入っているか)は invariants の担当なので、ここは構造だけを見る
// —— 空の belts / pipes は通す。エラー文言は約束しない(toThrow に引数を渡さない)。
import { describe, expect, it } from "vitest";
import type { TransportDef } from "../../src/lib/calc/types";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { generatorFixtureData } from "../fixtures/recipes";

/** 正しいベルトの定義を作り、検査したい 1 点だけを壊せるようにする */
const belt = (override: Partial<TransportDef> = {}): TransportDef => ({
	id: "Build_ConveyorBeltMk1_C",
	name: "Conveyor Belt Mk.1",
	nameJa: "コンベア・ベルト Mk.1",
	tier: 1,
	ratePerMinute: 60,
	...override,
});

const pipe = (override: Partial<TransportDef> = {}): TransportDef => ({
	id: "Build_Pipeline_C",
	name: "Pipeline Mk.1",
	nameJa: "パイプラインMk.1",
	tier: 1,
	ratePerMinute: 300,
	...override,
});

const withTransports = (belts: unknown, pipes: unknown = []): unknown => ({
	...generatorFixtureData,
	belts,
	pipes,
});

/** 搬送設備を知らない古い recipes.json を読んだ状況 */
const without = (key: "belts" | "pipes"): unknown => {
	const data: Record<string, unknown> = { ...generatorFixtureData };
	delete data[key];
	return data;
};

describe("搬送設備のスキーマ検証(issue #35)", () => {
	it("ベルト・パイプを含むデータは、そのままではスキーマ検証を通る", () => {
		expect(() =>
			validateRecipeData(withTransports([belt()], [pipe()])),
		).not.toThrow();
	});

	it("belts が無いとき、スキーマ検証がエラーになる", () => {
		expect(() => validateRecipeData(without("belts"))).toThrow();
	});

	it("pipes が無いとき、スキーマ検証がエラーになる", () => {
		expect(() => validateRecipeData(without("pipes"))).toThrow();
	});

	it("ベルト・パイプが 1 段も無い(空配列の)とき、スキーマ検証は通る", () => {
		// 収録漏れは invariants が落とす。ここで落とすと搬送設備を持たない
		// ローカル fixture がすべて検証を通らなくなる
		expect(() => validateRecipeData(withTransports([], []))).not.toThrow();
	});

	it("ベルト・パイプの ID が重複するとき、スキーマ検証がエラーになる", () => {
		expect(() =>
			validateRecipeData(withTransports([belt(), belt()])),
		).toThrow();
		expect(() =>
			validateRecipeData(withTransports([], [pipe(), pipe()])),
		).toThrow();
	});

	it("ベルト・パイプの表示名が無いとき、スキーマ検証がエラーになる", () => {
		const { name: _dropped, ...withoutName } = belt();
		expect(() => validateRecipeData(withTransports([withoutName]))).toThrow();
	});

	it("段(tier)が正の整数でないとき、スキーマ検証がエラーになる", () => {
		// tier はラベルの "Mk.4" にそのまま出るので、0・負・端数はどれも表示として成立しない
		expect(() =>
			validateRecipeData(withTransports([belt({ tier: 0 })])),
		).toThrow();
		expect(() =>
			validateRecipeData(withTransports([belt({ tier: -1 })])),
		).toThrow();
		expect(() =>
			validateRecipeData(withTransports([belt({ tier: 1.5 })])),
		).toThrow();
	});

	it("送量が正でないとき、スキーマ検証がエラーになる", () => {
		// 送量 0 は必要本数が 0 除算になる
		expect(() =>
			validateRecipeData(withTransports([belt({ ratePerMinute: 0 })])),
		).toThrow();
		expect(() =>
			validateRecipeData(withTransports([belt({ ratePerMinute: "-60" })])),
		).toThrow();
		expect(() =>
			validateRecipeData(withTransports([], [pipe({ ratePerMinute: 0 })])),
		).toThrow();
	});
});
