// Docs パーサーの実装都合テスト(unit)。issue #2 の約束レベルの検証は tests/spec/ 側。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeDocs, parseDocs } from "../../src/lib/docs/parse-docs";

const readFixture = (name: string) =>
	readFileSync(new URL(`../fixtures/docs/${name}`, import.meta.url));

// 実データの形式を模した最小の合成 Docs
const nativeClass = (suffix: string) =>
	`/Script/CoreUObject.Class'/Script/FactoryGame.${suffix}'`;
const itemClass = (id: string, amount: number) =>
	`(ItemClass="/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/X/${id.replace(/_C$/, "")}.${id}'",Amount=${amount})`;

const syntheticDocs = JSON.stringify([
	{
		NativeClass: nativeClass("FGBuildableManufacturer"),
		Classes: [
			{
				ClassName: "Build_OilRefinery_C",
				mDisplayName: "Refinery",
				mPowerConsumption: "30.000000",
			},
		],
	},
	{
		NativeClass: nativeClass("FGItemDescriptor"),
		Classes: [
			{
				ClassName: "Desc_LiquidOil_C",
				mDisplayName: "Crude Oil",
				mForm: "RF_LIQUID",
			},
			{
				ClassName: "Desc_Plastic_C",
				mDisplayName: "Plastic",
				mForm: "RF_SOLID",
			},
			{
				ClassName: "Desc_HeavyOilResidue_C",
				mDisplayName: "Heavy Oil Residue",
				mForm: "RF_LIQUID",
			},
		],
	},
	{
		NativeClass: nativeClass("FGRecipe"),
		Classes: [
			{
				ClassName: "Recipe_Plastic_C",
				mDisplayName: "Plastic",
				mIngredients: `(${itemClass("Desc_LiquidOil_C", 3000)})`,
				mProduct: `(${itemClass("Desc_Plastic_C", 2)},${itemClass("Desc_HeavyOilResidue_C", 1000)})`,
				mManufactoringDuration: "6.000000",
				mProducedIn:
					'("/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C")',
			},
			// Recipe_Alternate_Turbofuel_C と同じ「クラス名は旧仕様のままデフォルト化」パターン
			{
				ClassName: "Recipe_Alternate_LegacyName_C",
				mDisplayName: "Legacy Default",
				mIngredients: `(${itemClass("Desc_LiquidOil_C", 1000)})`,
				mProduct: `(${itemClass("Desc_HeavyOilResidue_C", 2000)})`,
				mManufactoringDuration: "4.000000",
				mProducedIn:
					'("/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C")',
			},
			{
				ClassName: "Recipe_PureOil_C",
				mDisplayName: "Alternate: Pure Oil",
				mIngredients: `(${itemClass("Desc_LiquidOil_C", 1000)})`,
				mProduct: `(${itemClass("Desc_Plastic_C", 1)})`,
				mManufactoringDuration: "4.000000",
				mProducedIn:
					'("/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C")',
			},
			{
				ClassName: "Recipe_Snow_C",
				mDisplayName: "Snow",
				mIngredients: `(${itemClass("Desc_LiquidOil_C", 1000)})`,
				mProduct: `(${itemClass("Desc_Plastic_C", 1)})`,
				mManufactoringDuration: "4.000000",
				mProducedIn:
					'("/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C")',
				mRelevantEvents: "(EV_Christmas)",
			},
			// 収録した機械には建設レシピが要る(無ければパーサーがエラーにする)
			{
				ClassName: "Recipe_OilRefinery_C",
				mDisplayName: "Refinery",
				mIngredients: `(${itemClass("Desc_Plastic_C", 10)})`,
				mProduct: `(${itemClass("Desc_OilRefinery_C", 1)})`,
				mManufactoringDuration: "1.000000",
				mProducedIn:
					'("/Game/FactoryGame/Equipment/BuildGun/BP_BuildGun.BP_BuildGun_C")',
			},
		],
	},
]);

/**
 * 発電機 1 種だけの合成 Docs。燃料側の mSupplementalResourceClass を差し替えられるようにして、
 * 「副資材必須(True)なのにクラスが空」という Docs 側の不整合を作れるようにする
 */
const generatorDocs = (supplementalClass: string) =>
	JSON.stringify([
		{
			NativeClass: nativeClass("FGItemDescriptor"),
			Classes: [
				{
					ClassName: "Desc_Coal_C",
					mDisplayName: "Coal",
					mForm: "RF_SOLID",
					mEnergyValue: "300.000000",
				},
				{
					ClassName: "Desc_Water_C",
					mDisplayName: "Water",
					mForm: "RF_LIQUID",
					mEnergyValue: "0.000000",
				},
				{
					ClassName: "Desc_IronPlateReinforced_C",
					mDisplayName: "Reinforced Iron Plate",
					mForm: "RF_SOLID",
				},
			],
		},
		{
			NativeClass: nativeClass("FGRecipe"),
			Classes: [
				// 収録した発電機には建設レシピが要る(無ければパーサーがエラーにする)
				{
					ClassName: "Recipe_GeneratorCoal_C",
					mDisplayName: "Coal-Powered Generator",
					mIngredients: `(${itemClass("Desc_IronPlateReinforced_C", 20)})`,
					mProduct: `(${itemClass("Desc_GeneratorCoal_C", 1)})`,
					mManufactoringDuration: "1.000000",
					mProducedIn:
						'("/Game/FactoryGame/Equipment/BuildGun/BP_BuildGun.BP_BuildGun_C")',
				},
			],
		},
		{
			NativeClass: nativeClass("FGBuildableGeneratorFuel"),
			Classes: [
				{
					ClassName: "Build_GeneratorCoal_C",
					mDisplayName: "Coal-Powered Generator",
					mPowerProduction: "75.000000",
					mFuel: [
						{
							mFuelClass: "Desc_Coal_C",
							mSupplementalResourceClass: supplementalClass,
						},
					],
					mRequiresSupplementalResource: "True",
					mSupplementalToPowerRatio: "10.000000",
				},
			],
		},
	]);

describe("parseDocs", () => {
	it("液体・気体の数量はリットルから m³ に変換される(÷1000)", () => {
		const data = parseDocs(syntheticDocs);
		const recipe = data.recipes.find((r) => r.id === "Recipe_Plastic_C");
		expect(recipe?.inputs).toEqual([{ item: "Desc_LiquidOil_C", amount: 3 }]);
		expect(recipe?.outputs).toEqual([
			{ item: "Desc_Plastic_C", amount: 2 },
			{ item: "Desc_HeavyOilResidue_C", amount: 1 },
		]);
		expect(data.items.Desc_LiquidOil_C?.form).toBe("liquid");
		expect(data.items.Desc_Plastic_C?.form).toBe("solid");
	});

	it("代替判定は表示名で行う: クラス名が Recipe_Alternate_* でも表示名に Alternate: が無ければデフォルト扱い", () => {
		const data = parseDocs(syntheticDocs);
		const legacy = data.recipes.find(
			(r) => r.id === "Recipe_Alternate_LegacyName_C",
		);
		expect(legacy?.alternate).toBe(false);
		const pureOil = data.recipes.find((r) => r.id === "Recipe_PureOil_C");
		expect(pureOil?.alternate).toBe(true);
	});

	it("期間限定イベント(mRelevantEvents あり)のレシピは収録されない", () => {
		const data = parseDocs(syntheticDocs);
		expect(data.recipes.some((r) => r.id === "Recipe_Snow_C")).toBe(false);
	});

	it("可変電力の機械(粒子加速器)とそのレシピは v1 では除外される", () => {
		// fixture には Build_HadronCollider_C と Recipe_DarkMatter_C が含まれている
		const data = parseDocs(
			decodeDocs(readFixture("en-US.json")),
			decodeDocs(readFixture("ja.json")),
		);
		expect(data.buildings.Build_HadronCollider_C).toBeUndefined();
		expect(data.recipes.some((r) => r.id === "Recipe_DarkMatter_C")).toBe(
			false,
		);
	});

	it("地熱発電機は収録されない(出力が立地依存で定格が無い)", () => {
		// fixture には Build_GeneratorGeoThermal_C が別 NativeClass で含まれている
		const data = parseDocs(
			decodeDocs(readFixture("en-US.json")),
			decodeDocs(readFixture("ja.json")),
		);
		expect(
			data.generators.some((g) => g.id === "Build_GeneratorGeoThermal_C"),
		).toBe(false);
		// 発電機はビルディング(製造機械)辞書にも混ざらない
		expect(data.buildings.Build_GeneratorCoal_C).toBeUndefined();
	});

	it("mRequiresSupplementalResource が True なのに副資材クラスが空の燃料があるとき、エラーになる", () => {
		// 黙って supplemental を落とすと水の需要が過少表示になるだけで気づけない。
		// 空クラスをそのまま流すとアイテム辞書の構築側でも落ちるので、どのフィールドが
		// 不整合かまで見て「この検査が効いていること」を確かめる(unit 層なので文言に寄せてよい)
		expect(() => parseDocs(generatorDocs(""))).toThrow(
			/mSupplementalResourceClass/,
		);
		// クラスさえ埋まっていれば同じ Docs は通る(落ちる理由がこの不整合だけだと確かめる)
		expect(() => parseDocs(generatorDocs("Desc_Water_C"))).not.toThrow();
	});

	it("ja テキストを渡さないとき nameJa は付かない", () => {
		const data = parseDocs(decodeDocs(readFixture("en-US.json")));
		expect(data.items.Desc_IronPlate_C?.name).toBe("Iron Plate");
		expect(data.items.Desc_IronPlate_C?.nameJa).toBeUndefined();
	});
});

describe("decodeDocs", () => {
	it("UTF-16LE の BOM を取り除いて復号する", () => {
		expect(decodeDocs(Buffer.from("﻿[]", "utf16le"))).toBe("[]");
	});
});
