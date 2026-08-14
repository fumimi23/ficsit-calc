// @vitest-environment jsdom
// issue #19: アイテム検索 — 検索欄で選択リストを絞り込めるようにする。
// 検索欄がネイティブ select の選択肢を絞り込むという UI の約束を固定する。
// 絞り込みの一致規則そのものは tests/spec/item-search.test.ts(純関数)が固定する。
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionPlanner } from "../../../src/components/ProductionPlanner";
import { fixtureData } from "../../fixtures/recipes";

// mermaid の実描画は jsdom では動かない(SVG 計測 API が無い)ためモックする
vi.mock("mermaid", () => ({
	default: {
		initialize: vi.fn(),
		render: vi.fn(async () => ({ svg: "<svg><title>flow</title></svg>" })),
	},
}));

afterEach(cleanup);

describe("アイテム検索(issue #19)", () => {
	it("検索欄に文字を入力したとき、選択リストが部分一致で絞り込まれる", async () => {
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.type(screen.getByLabelText("アイテム検索"), "鉄板");

		const select = screen.getByLabelText("アイテム");
		const labels = within(select)
			.getAllByRole("option")
			.map((option) => option.textContent);
		// プレースホルダー + 部分一致した 2 件(表示順は約束しない)
		expect(labels).toHaveLength(3);
		expect(labels).toContain("鉄板");
		expect(labels).toContain("強化鉄板");
	});

	it("マッチが 0 件のとき、その旨が表示される", async () => {
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.type(screen.getByLabelText("アイテム検索"), "存在しない名前");

		screen.getByRole("status");
		// 選択リストはプレースホルダーだけになる
		const select = screen.getByLabelText("アイテム");
		expect(within(select).getAllByRole("option")).toHaveLength(1);
	});

	it("絞り込み後にアイテムを選択すると、従来どおり計画が表示される", async () => {
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.type(screen.getByLabelText("アイテム検索"), "強化");
		await user.selectOptions(
			screen.getByLabelText("アイテム"),
			"reinforced-iron-plate",
		);
		await user.type(screen.getByLabelText(/目標レート/), "5");

		screen.getByRole("table"); // 機械一覧
		screen.getByText(/総電力:/);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
