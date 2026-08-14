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
		// 部分一致した 2 件だけになる(表示順は約束しない)
		expect(labels).toHaveLength(2);
		expect(labels).toContain("鉄板");
		expect(labels).toContain("強化鉄板");
	});

	it("マッチが 0 件のとき、その旨が表示される", async () => {
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.type(screen.getByLabelText("アイテム検索"), "存在しない名前");

		// ライブリージョンは常時マウントなので、存在ではなく中身で判定する
		// (文言そのものは約束しない)
		expect(screen.getByRole("status").textContent).not.toBe("");
		// 選択リストは空になる
		const select = screen.getByLabelText("アイテム");
		expect(within(select).queryAllByRole("option")).toHaveLength(0);
	});

	it("クリアボタンを押すと検索欄が空になり、絞り込みが解除される", async () => {
		// ブラウザ手動確認でのユーザー要望(PR #40)。ネイティブの内蔵クリアは
		// ブラウザ依存(Firefox には無い)なので、明示のボタンを約束にする
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.type(screen.getByLabelText("アイテム検索"), "ネジ");
		await user.click(screen.getByRole("button", { name: "検索をクリア" }));

		expect(screen.getByLabelText<HTMLInputElement>("アイテム検索").value).toBe(
			"",
		);
		// 全 6 アイテムに戻る
		const select = screen.getByLabelText("アイテム");
		expect(within(select).getAllByRole("option")).toHaveLength(6);
	});

	it("選択済みのアイテムは、検索で絞り込みから外れても選択肢に残り、計画も表示され続ける", async () => {
		// issue の受け入れ条件ではなく PR #40 での設計判断。select の表示が
		// プレースホルダーに戻ると表示中の計画と食い違うため、選択済みは残すと約束する
		const user = userEvent.setup();
		render(<ProductionPlanner data={fixtureData} />);
		await user.selectOptions(screen.getByLabelText("アイテム"), "iron-plate");
		await user.type(screen.getByLabelText(/目標レート/), "30");
		await user.type(screen.getByLabelText("アイテム検索"), "ネジ");

		const select = screen.getByLabelText<HTMLSelectElement>("アイテム");
		expect(select.value).toBe("iron-plate");
		const labels = within(select)
			.getAllByRole("option")
			.map((option) => option.textContent);
		expect(labels).toContain("鉄板"); // 選択済みとして残る
		expect(labels).toContain("ネジ"); // 検索のマッチ分
		screen.getByRole("table"); // 計画は表示され続ける
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
