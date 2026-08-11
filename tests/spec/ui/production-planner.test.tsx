// @vitest-environment jsdom
// issue #3: Web UI 最小版 — 入力から結果ツリーを表示する。
// 受け入れ条件をコンポーネント spec として固定する。fixture(tests/fixtures/recipes.ts)を
// props で注入し、ゲームデータ更新で UI の約束が揺れないようにする。
// 「静的配信で動作する」(受け入れ条件 3)は自動化せず、ブラウザでの手動確認とする。
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProductionPlanner } from "../../../src/components/ProductionPlanner";
import type { RecipeData } from "../../../src/lib/calc/types";
import { fixtureData } from "../../fixtures/recipes";

afterEach(cleanup);

async function enterTarget(data: RecipeData, itemId: string, rate: string) {
	const user = userEvent.setup();
	render(<ProductionPlanner data={data} />);
	await user.selectOptions(screen.getByLabelText("アイテム"), itemId);
	await user.type(screen.getByLabelText(/目標レート/), rate);
	return user;
}

describe("Web UI 最小版(issue #3)", () => {
	it("アイテムを選択し目標レート(個/分)を入力したとき、機械一覧(種類・台数)・原料合計・総電力(MW)が表示される", async () => {
		await enterTarget(fixtureData, "iron-plate", "30");

		// 機械一覧: レシピごとに機械の種類・台数(小数のまま + 建設台数併記)・電力
		const table = screen.getByRole("table");
		const plateRow = within(table).getByText("鉄板").closest("tr");
		expect(plateRow).not.toBeNull();
		within(plateRow as HTMLElement).getByText("構築機");
		within(plateRow as HTMLElement).getByText("1.5 台（建設 2 台）");
		within(plateRow as HTMLElement).getByText("6 MW");

		const ingotRow = within(table).getByText("鉄インゴット").closest("tr");
		within(ingotRow as HTMLElement).getByText("製錬炉");
		within(ingotRow as HTMLElement).getByText("1.5 台（建設 2 台）");

		// 原料合計
		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("鉄鉱石: 45 /分");

		// 総電力
		screen.getByText("総電力: 12 MW");

		// 副産物が無いチェーンでは余剰は表示されない
		expect(screen.queryByRole("list", { name: "余剰（副産物）" })).toBeNull();
	});

	it("中間素材の連鎖が階層(ツリー)で表示される", async () => {
		await enterTarget(fixtureData, "reinforced-iron-plate", "5");

		const tree = screen.getByRole("list", { name: "生産ツリー" });

		// ネジの枝の中にロッド、その中にインゴット、末端は原料(鉄鉱石)
		const screwItem = within(tree).getByText("ネジ 60 /分").closest("li");
		expect(screwItem).not.toBeNull();
		const rodItem = within(screwItem as HTMLElement)
			.getByText("鉄のロッド 15 /分")
			.closest("li");
		const ingotItem = within(rodItem as HTMLElement)
			.getByText("鉄インゴット 15 /分")
			.closest("li");
		within(ingotItem as HTMLElement).getByText("鉄鉱石 15 /分（原料）");

		// 鉄板の枝は別レートで並存する
		within(tree).getByText("鉄板 30 /分");
	});

	it('".5" のような表記は正規化されて受理される(issue #8)', async () => {
		await enterTarget(fixtureData, "iron-plate", ".5");

		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("鉄鉱石: 0.75 /分");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("解釈できない入力(指数表記等)は入力エラーが表示され、結果は表示されない(issue #8)", async () => {
		await enterTarget(fixtureData, "iron-plate", "1e-7");

		screen.getByRole("alert");
		expect(screen.queryByRole("table")).toBeNull();
		expect(screen.queryByRole("list", { name: "原料合計" })).toBeNull();
	});

	it("副産物が出るチェーンでは余剰(byproducts)が表示される", async () => {
		// 原油 3 → プラスチック 2 + 廃重油 1 のミニ fixture(実データの Recipe_Plastic_C を模す)
		const byproductData: RecipeData = {
			items: {
				crude: { name: "原油", form: "liquid" },
				plastic: { name: "プラスチック" },
				residue: { name: "廃重油", form: "liquid" },
			},
			buildings: { refinery: { name: "精製機", powerMW: 30 } },
			recipes: [
				{
					id: "plastic",
					name: "プラスチック",
					building: "refinery",
					durationSeconds: 6,
					alternate: false,
					inputs: [{ item: "crude", amount: 3 }],
					outputs: [
						{ item: "plastic", amount: 2 },
						{ item: "residue", amount: 1 },
					],
				},
			],
		};
		await enterTarget(byproductData, "plastic", "20");

		const byproducts = screen.getByRole("list", { name: "余剰（副産物）" });
		within(byproducts).getByText("廃重油: 10 /分");
		// 需要側(原料)は相殺されず全量のまま
		const rawList = screen.getByRole("list", { name: "原料合計" });
		within(rawList).getByText("原油: 30 /分");
	});
});
