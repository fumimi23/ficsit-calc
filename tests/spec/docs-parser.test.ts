// issue #2: Docs パーサー — ゲーム同梱 Docs から data/recipes.json を生成する
// 受け入れ条件をそのまま約束テストとして固定する。
// fixture は実ゲームの Docs から切り出した縮小版(tests/fixtures/docs/、UTF-16LE + BOM の実形式。
// データポリシーにより説明文・フレーバーテキストは除去済み)。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import type { ExactNumeric, RecipeIngredient } from "../../src/lib/calc/types";
import { validateRecipeData } from "../../src/lib/calc/validate";
import { decodeDocs, parseDocs } from "../../src/lib/docs/parse-docs";

const read = (name: string) =>
	readFileSync(new URL(`../fixtures/docs/${name}`, import.meta.url));

const parseFixture = () =>
	parseDocs(decodeDocs(read("en-US.json")), decodeDocs(read("ja.json")));

describe("Docs パーサー(issue #2)", () => {
	it("UTF-16 の en-US.json を入力に実行したとき、スキーマ準拠の recipes.json 相当データが生成される(スキーマ検証を通る)", () => {
		const data = parseFixture();
		expect(() => validateRecipeData(data)).not.toThrow();
		// 空データがスキーマ検証をすり抜けていないことの確認
		expect(data.recipes.length).toBeGreaterThan(0);
		expect(Object.keys(data.items).length).toBeGreaterThan(0);
		expect(Object.keys(data.buildings).length).toBeGreaterThan(0);
	});

	it("生成物に「モジュラーフレーム」のデフォルトレシピが正しい入出力・機械・所要時間・電力で含まれる", () => {
		const data = parseFixture();

		const recipe = data.recipes.find((r) => r.id === "Recipe_ModularFrame_C");
		expect(recipe).toBeDefined();
		expect(recipe?.name).toBe("Modular Frame");
		expect(recipe?.nameJa).toBe("モジュラー・フレーム");
		expect(recipe?.building).toBe("Build_AssemblerMk1_C");
		expect(recipe?.durationSeconds).toBe(60);
		expect(recipe?.alternate).toBe(false);
		// 入力の並び順は約束しない(受け入れ条件は「正しい入出力」であって順序ではない)
		const byItem = (a: { item: string }, b: { item: string }) =>
			a.item < b.item ? -1 : 1;
		expect([...(recipe?.inputs ?? [])].sort(byItem)).toEqual([
			{ item: "Desc_IronPlateReinforced_C", amount: 3 },
			{ item: "Desc_IronRod_C", amount: 12 },
		]);
		expect(recipe?.outputs).toEqual([
			{ item: "Desc_ModularFrame_C", amount: 2 },
		]);

		// 電力は機械(組立機)側に持つ
		expect(data.buildings.Build_AssemblerMk1_C?.powerMW).toBe(15);
		expect(data.buildings.Build_AssemblerMk1_C?.nameJa).toBe("組立機");
	});

	// issue #12: 「代替レシピは既定で除外される」(issue #2)の意図された撤回。
	// レシピ選択(ロードマップ 3)の前提として alternate も収録し、フラグで区別する
	it("代替レシピが alternate: true で収録され、通常レシピと同じ入出力・機械・所要時間を持つ", () => {
		const data = parseFixture();

		const recipe = data.recipes.find(
			(r) => r.id === "Recipe_Alternate_Screw_C",
		);
		expect(recipe).toBeDefined();
		expect(recipe?.alternate).toBe(true);
		expect(recipe?.name).toBe("Alternate: Cast Screws");
		expect(recipe?.nameJa).toBe("代替: 鋳造ネジ");
		expect(recipe?.building).toBe("Build_ConstructorMk1_C");
		expect(recipe?.durationSeconds).toBe(24);
		expect(recipe?.inputs).toEqual([{ item: "Desc_IronIngot_C", amount: 5 }]);
		expect(recipe?.outputs).toEqual([{ item: "Desc_IronScrew_C", amount: 20 }]);
	});

	it("デフォルトレシピには alternate: true が立たない(表示名 Alternate: プレフィックスで判定)", () => {
		const data = parseFixture();
		const modularFrame = data.recipes.find(
			(r) => r.id === "Recipe_ModularFrame_C",
		);
		expect(modularFrame?.alternate).toBe(false);
	});

	it("手作業で作った建築物専用レシピ等、製造機械に紐づかないレシピは含まれない", () => {
		const data = parseFixture();
		// fixture には WorkBench(手作業)専用の Recipe_XenoZapper_C が含まれている
		expect(data.recipes.some((r) => r.id === "Recipe_XenoZapper_C")).toBe(
			false,
		);
		// 含まれるレシピの機械はすべてビルディング辞書に存在する
		for (const r of data.recipes) {
			expect(data.buildings[r.building]).toBeDefined();
		}
	});
});

// issue #20: 必要発電機リスト — 総電力から必要台数・必要燃料を出すために、
// Docs から発電機(定格出力・燃焼できる燃料・副資材)も収録する。
describe("Docs パーサー: 発電機の収録(issue #20)", () => {
	// ExactNumeric の表現(number / 十進文字列)は約束しないので、値は Fraction で比べる
	const expectValue = (actual: ExactNumeric | undefined, expected: string) => {
		expect(
			actual === undefined ? undefined : Fraction.from(actual).toString(),
		).toBe(Fraction.from(expected).toString());
	};

	it("石炭発電機が定格 75MW・石炭燃料(300MJ)・水の副資材(0.01 m³/MJ)付きで収録される", () => {
		const data = parseFixture();

		const coal = data.generators.find((g) => g.id === "Build_GeneratorCoal_C");
		expect(coal).toBeDefined();
		expect(coal?.name).toBe("Coal-Powered Generator");
		expect(coal?.nameJa).toBe("石炭発電機");
		expectValue(coal?.powerMW, "75");
		expect(coal?.fuels).toHaveLength(1);
		expect(coal?.fuels[0]?.item).toBe("Desc_Coal_C");
		expectValue(coal?.fuels[0]?.energyMJ, "300");
		expect(coal?.fuels[0]?.supplemental?.item).toBe("Desc_Water_C");
		// Docs の mSupplementalToPowerRatio は L/MJ。数量と同じく m³ 基準に直す
		expectValue(coal?.fuels[0]?.supplemental?.amountPerMJ, "0.01");
	});

	it("液体燃料のエネルギー値は MJ/L から MJ/m³ に換算される(0.75 → 750)", () => {
		const data = parseFixture();

		const fuel = data.generators.find((g) => g.id === "Build_GeneratorFuel_C");
		expectValue(fuel?.powerMW, "250");
		expect(fuel?.fuels[0]?.item).toBe("Desc_LiquidFuel_C");
		expectValue(fuel?.fuels[0]?.energyMJ, "750");
		// 副資材を要求しない発電機には supplemental が付かない
		expect(fuel?.fuels[0]?.supplemental).toBeUndefined();
	});

	it("原子力発電所が定格 2500MW・ウラン燃料棒(750000MJ)・水の副資材(0.0016 m³/MJ)付きで収録される", () => {
		// 燃料式とは別の NativeClass(FGBuildableGeneratorNuclear)から拾う経路を通す
		const data = parseFixture();

		const nuclear = data.generators.find(
			(g) => g.id === "Build_GeneratorNuclear_C",
		);
		expect(nuclear).toBeDefined();
		expect(nuclear?.name).toBe("Nuclear Power Plant");
		expect(nuclear?.nameJa).toBe("原子力発電所");
		expectValue(nuclear?.powerMW, "2500");
		// 固体燃料なので m³ 換算(×1000)は掛からない
		expect(nuclear?.fuels[0]?.item).toBe("Desc_NuclearFuelRod_C");
		expectValue(nuclear?.fuels[0]?.energyMJ, "750000");
		expect(nuclear?.fuels[0]?.supplemental?.item).toBe("Desc_Water_C");
		// 1.6 L/MJ ÷ 1000 = 0.0016 m³/MJ(2500MW で水 240 m³/分 = ゲーム内の既知値)
		expectValue(nuclear?.fuels[0]?.supplemental?.amountPerMJ, "0.0016");
	});

	it("発電機の燃料・副資材のアイテムがアイテム辞書に収録される", () => {
		// レシピからしか items を作らないと、燃料アイテムの表示名が引けず参照整合性も壊れる
		const data = parseFixture();

		for (const id of ["Desc_Coal_C", "Desc_Water_C", "Desc_LiquidFuel_C"]) {
			expect(data.items[id]).toBeDefined();
		}
		expect(data.items.Desc_Coal_C?.name).toBe("Coal");
		expect(data.items.Desc_Water_C?.form).toBe("liquid");
	});
});

// issue #21: 建設コスト計算 — 機械・発電機の建設素材を Build Gun の建設レシピから収録する。
describe("Docs パーサー: 建設素材の収録(issue #21)", () => {
	// 並び順も ExactNumeric の表現も約束しないので、アイテム順に揃えた既約分数文字列で比べる
	const costOf = (list: RecipeIngredient[] | undefined) =>
		[...(list ?? [])]
			.map((c) => ({
				item: c.item,
				amount: Fraction.from(c.amount).toString(),
			}))
			.sort((a, b) => (a.item < b.item ? -1 : 1));

	it("機械の建設素材が Build Gun の建設レシピから収録される", () => {
		const data = parseFixture();

		expect(
			costOf(data.buildings.Build_ConstructorMk1_C?.constructionCost),
		).toEqual([
			{ item: "Desc_Cable_C", amount: "8" },
			{ item: "Desc_IronPlateReinforced_C", amount: "2" },
		]);
	});

	it("建設レシピの対応はレシピ ClassName ではなく product で決まる", () => {
		// 罠: 製錬炉の建設レシピは Recipe_SmelterBasicMk1_C で、Recipe_SmelterMk1_C は鋳造炉のもの。
		// ClassName 規約で対応付けると製錬炉に鋳造炉のコストが付く
		const data = parseFixture();

		expect(costOf(data.buildings.Build_SmelterMk1_C?.constructionCost)).toEqual(
			[
				{ item: "Desc_IronRod_C", amount: "5" },
				{ item: "Desc_Wire_C", amount: "8" },
			],
		);
	});

	it("発電機にも建設素材が収録される", () => {
		const data = parseFixture();

		const coal = data.generators.find((g) => g.id === "Build_GeneratorCoal_C");
		expect(costOf(coal?.constructionCost)).toEqual([
			{ item: "Desc_Cable_C", amount: "30" },
			{ item: "Desc_IronPlateReinforced_C", amount: "20" },
			{ item: "Desc_Rotor_C", amount: "10" },
		]);
	});

	it("建設素材のアイテムがアイテム辞書に収録される", () => {
		// 製造レシピからしか items を作らないと、建設専用の素材の表示名が引けず参照整合性も壊れる
		const data = parseFixture();

		expect(data.items.Desc_Cable_C?.name).toBe("Cable");
		expect(data.items.Desc_Cable_C?.nameJa).toBe("ケーブル");
		expect(data.items.Desc_Rotor_C).toBeDefined();
		expect(data.items.Desc_Wire_C).toBeDefined();
	});

	it("建設レシピ自体は製造レシピとして収録されない", () => {
		// 建設レシピは Build Gun で「建てる」ものなので、生産チェーンの候補に出してはいけない
		const data = parseFixture();

		expect(data.recipes.some((r) => r.id === "Recipe_ConstructorMk1_C")).toBe(
			false,
		);
		expect(data.recipes.some((r) => r.id === "Recipe_SmelterMk1_C")).toBe(
			false,
		);
	});
});

// issue #23: 採取設備を計画に含めるために、Docs から採取設備
// (対象資源・採取レート・電力・建設素材)も収録する。
describe("Docs パーサー: 採取設備の収録(issue #23)", () => {
	// ExactNumeric の表現(number / 十進文字列)は約束しないので、値は Fraction で比べる
	const expectValue = (actual: ExactNumeric | undefined, expected: string) => {
		expect(
			actual === undefined ? undefined : Fraction.from(actual).toString(),
		).toBe(Fraction.from(expected).toString());
	};
	const costOf = (list: RecipeIngredient[] | undefined) =>
		[...(list ?? [])]
			.map((c) => ({
				item: c.item,
				amount: Fraction.from(c.amount).toString(),
			}))
			.sort((a, b) => (a.item < b.item ? -1 : 1));

	const extractorOf = (id: string) =>
		parseFixture().extractors.find((e) => e.id === id);

	it("揚水ポンプが定格 20MW・採取レート 120 m³/分・水専用で収録される", () => {
		// Docs は 1 サイクル 1 秒あたり 2000 L。数量と同じく m³ 基準に直して 120 m³/分
		const waterPump = extractorOf("Build_WaterPump_C");

		expect(waterPump).toBeDefined();
		expect(waterPump?.name).toBe("Water Extractor");
		expect(waterPump?.nameJa).toBe("揚水ポンプ");
		expectValue(waterPump?.powerMW, "20");
		expectValue(waterPump?.ratePerMinute, "120");
		expect(waterPump?.resources).toEqual(["Desc_Water_C"]);
	});

	it("採鉱機の採取レートがサイクル時間から換算される(Mk.1 は 60/分、Mk.2 は 120/分)", () => {
		// 固体は m³ 換算が掛からない。Mk.2 はサイクル 0.5 秒なので Mk.1 の倍
		const mk1 = extractorOf("Build_MinerMk1_C");
		const mk2 = extractorOf("Build_MinerMk2_C");

		expectValue(mk1?.powerMW, "5");
		expectValue(mk1?.ratePerMinute, "60");
		expect(mk2?.nameJa).toBe("採鉱機 Mk.2");
		expectValue(mk2?.powerMW, "15");
		expectValue(mk2?.ratePerMinute, "120");
	});

	it("資源を限定しない採鉱機には、同じ形態の資源がすべて対象として収録される", () => {
		// mOnlyAllowCertainResources=False の設備は mAllowedResources が空なので、
		// mAllowedResourceForms(RF_SOLID)から資源 descriptor を引いて展開する
		const mk2 = extractorOf("Build_MinerMk2_C");

		expect(mk2?.resources).toEqual(["Desc_Coal_C", "Desc_OreIron_C"]);
	});

	it("資源井の抽出機(立地依存)は採取設備として収録されない", () => {
		// レートがサテライト数・加圧機の立地に依存し、定格 1 つでは表せない。
		// 資源(水・原油)で除外すると揚水ポンプまで落ちるので、NativeClass で除外する
		const data = parseFixture();

		expect(data.extractors.map((e) => e.id)).not.toContain(
			"Build_FrackingExtractor_C",
		);
	});

	it("採取設備にも建設素材が収録される", () => {
		expect(costOf(extractorOf("Build_WaterPump_C")?.constructionCost)).toEqual([
			{ item: "Desc_CopperSheet_C", amount: "20" },
			{ item: "Desc_IronPlateReinforced_C", amount: "10" },
			{ item: "Desc_Rotor_C", amount: "10" },
		]);
	});

	it("採取設備の対象資源・建設素材のアイテムがアイテム辞書に収録される", () => {
		// レシピ・発電機からしか items を作らないと、採取設備専用の素材の表示名が
		// 引けず参照整合性も壊れる
		const data = parseFixture();

		expect(data.items.Desc_SteelPipe_C?.name).toBe("Steel Pipe");
		expect(data.items.BP_ItemDescriptorPortableMiner_C?.nameJa).toBe(
			"携帯式採鉱機",
		);
		expect(data.items.Desc_Cement_C).toBeDefined();
		expect(data.items.Desc_Water_C?.form).toBe("liquid");
	});
});
