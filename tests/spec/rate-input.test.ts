// issue #8: 数値入力の受理域 — UI 側の正規化で吸収する(コアの Fraction.from は厳格なまま)。
// 受理した値は必ず Fraction.from が受け付ける十進文字列になる、が normalizeRateInput の契約。
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";
import { normalizeRateInput } from "../../src/lib/ui/rate-input";

describe("目標レート入力の正規化(issue #8)", () => {
	it.each([
		["30", "30"],
		["7.5", "7.5"],
		[".5", "0.5"],
		["5.", "5"],
		[" 30 ", "30"],
		["0", "0"],
	])("%j は %j として受理され、正確な分数になる", (raw, expected) => {
		const result = normalizeRateInput(raw);
		expect(result).toEqual({ ok: true, value: expected });
		if (result.ok) {
			expect(() => Fraction.from(result.value)).not.toThrow();
		}
	});

	it.each([
		["1e-7", "指数表記"],
		["abc", "数値でない文字列"],
		["", "空文字"],
		["   ", "空白のみ"],
		[".", "数字なし"],
		["1.2.3", "十進表記でない"],
	])("%j (%s) は明示的な入力エラーになる", (raw) => {
		const result = normalizeRateInput(raw);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message.length).toBeGreaterThan(0);
		}
	});

	it("負数は明示的な入力エラーになる(生産レートは 0 以上)", () => {
		const result = normalizeRateInput("-3");
		expect(result.ok).toBe(false);
	});
});
