// @vitest-environment jsdom
// issue #22: ノードごとのレシピ切り替え — 生産ツリーのノードに置いたドロップダウンで
// 使うレシピを選び、結果が再計算されることをコンポーネント spec として固定する。
// マージ規則そのもの(候補列挙・上書きの検証)は tests/spec/recipe-override.test.ts が
// 実データで固定する。ここでは fixture を注入し、ゲームデータ更新で揺れないようにする。
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionPlanner } from "../../../src/components/ProductionPlanner";
import type { RecipeData } from "../../../src/lib/calc/types";
import { multiRecipeFixtureData } from "../../fixtures/recipes";

// mermaid の実描画は jsdom では動かない(SVG 計測 API が無い)ためモックする
vi.mock("mermaid", () => ({
	default: {
		initialize: vi.fn(),
		render: vi.fn(async () => ({ svg: "<svg><title>flow</title></svg>" })),
	},
}));

afterEach(cleanup);

async function enterTarget(data: RecipeData, itemId: string, rate: string) {
	const user = userEvent.setup();
	render(<ProductionPlanner data={data} />);
	await user.selectOptions(screen.getByLabelText("アイテム"), itemId);
	const rateInput = screen.getByLabelText(/目標レート/);
	// アイテム選択で 1 台分レートが自動入力される(issue #48)ので、type の前に空にする
	await user.clear(rateInput);
	await user.type(rateInput, rate);
	return user;
}

describe("ノードごとのレシピ切り替え(issue #22)", () => {
	it("複数の候補があるアイテムのノードでレシピを切り替えたとき、機械一覧・原料合計・総電力が新しいレシピで再計算される", async () => {
		const user = await enterTarget(multiRecipeFixtureData, "biomass", "60");

		// 既定は primary 選択(ID 辞書順)の「バイオマス（葉）」: 1 台 / 葉 120 個/分 / 4MW
		within(screen.getByRole("table")).getByText("バイオマス（葉）");
		within(screen.getByRole("list", { name: "原料合計" })).getByText(
			"葉: 120 /分",
		);
		screen.getByText("総電力: 4 MW");

		await user.selectOptions(
			screen.getByRole("combobox", { name: "バイオマスのレシピ" }),
			"biomass-wood",
		);

		// 「バイオマス（木）」: 0.5 台 / 木材 15 個/分 / 2MW
		const table = screen.getByRole("table");
		within(table).getByText("バイオマス（木）");
		within(table).getByText("0.5 台（建設 1 台）");
		expect(within(table).queryByText("バイオマス（葉）")).toBeNull();
		within(screen.getByRole("list", { name: "原料合計" })).getByText(
			"木材: 15 /分",
		);
		screen.getByText("総電力: 2 MW");
	});

	it("候補が 1 つしか無いノードと、候補が 1 つも無い原料ノードには、レシピ選択が現れない", async () => {
		// 選びようがないところにドロップダウンを出すと、切り替えられるノードが埋もれる
		await enterTarget(multiRecipeFixtureData, "packaged-fuel", "60");

		const tree = screen.getByRole("list", { name: "生産ツリー" });
		expect(within(tree).getAllByRole("combobox")).toHaveLength(1);
		screen.getByRole("combobox", { name: "燃料のレシピ" });
		// 包装済み燃料・空の容器は候補 1 本、原油・プラスチックは候補なし
		expect(
			screen.queryByRole("combobox", { name: "包装済み燃料のレシピ" }),
		).toBeNull();
		expect(
			screen.queryByRole("combobox", { name: "空の容器のレシピ" }),
		).toBeNull();
		expect(screen.queryByRole("combobox", { name: "原油のレシピ" })).toBeNull();
		expect(
			screen.queryByRole("combobox", { name: "プラスチックのレシピ" }),
		).toBeNull();
	});

	it("alternate しか生産手段が無いアイテムでレシピを選んだとき、原料ノードだったところからチェーンが伸び、既定に戻せる", async () => {
		const user = await enterTarget(
			multiRecipeFixtureData,
			"compacted-coal",
			"30",
		);

		// 既定では primary 候補が無いので原料として終端する
		within(screen.getByRole("list", { name: "原料合計" })).getByText(
			"圧縮石炭: 30 /分",
		);

		const picker = screen.getByRole("combobox", { name: "圧縮石炭のレシピ" });
		await user.selectOptions(picker, "enriched-coal");

		const raw = screen.getByRole("list", { name: "原料合計" });
		within(raw).getByText("石炭: 30 /分");
		within(raw).getByText("硫黄: 30 /分");
		expect(within(raw).queryByText(/圧縮石炭/)).toBeNull();
		screen.getByText("総電力: 18 MW");

		// 原料終端のノードには「原料として扱う」既定の選択肢がある
		await user.selectOptions(
			screen.getByRole("combobox", { name: "圧縮石炭のレシピ" }),
			"",
		);
		within(screen.getByRole("list", { name: "原料合計" })).getByText(
			"圧縮石炭: 30 /分",
		);
	});
});

describe("循環する選択の扱い(issue #22)", () => {
	it("循環が生じるレシピを選んだとき、エラーが表示され結果が消える", async () => {
		const user = await enterTarget(
			multiRecipeFixtureData,
			"packaged-fuel",
			"60",
		);

		// 燃料を開封レシピにすると 包装済み燃料 → 燃料 → 包装済み燃料 で循環する
		await user.selectOptions(
			screen.getByRole("combobox", { name: "燃料のレシピ" }),
			"unpack-fuel",
		);

		screen.getByRole("alert");
		expect(screen.queryByRole("list", { name: "原料合計" })).toBeNull();
		expect(screen.queryByRole("list", { name: "生産ツリー" })).toBeNull();
	});

	it("循環でエラーになった状態から、選択をデフォルトに戻すと計画表示に復帰できる", async () => {
		// ツリーごと消えるのでノードのドロップダウンからは戻せない。
		// 戻す手段が無いと行き止まりになるため、エラー時は上書き一覧を出す
		const user = await enterTarget(
			multiRecipeFixtureData,
			"packaged-fuel",
			"60",
		);
		await user.selectOptions(
			screen.getByRole("combobox", { name: "燃料のレシピ" }),
			"unpack-fuel",
		);
		screen.getByRole("alert");

		await user.click(
			screen.getByRole("button", { name: "燃料をデフォルトに戻す" }),
		);

		expect(screen.queryByRole("alert")).toBeNull();
		within(screen.getByRole("list", { name: "原料合計" })).getByText(
			"原油: 90 /分",
		);
	});
});
