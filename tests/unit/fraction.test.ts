// Fraction の実装都合テスト(unit)。issue #6 の約束レベルの検証は tests/spec/ 側。
import { describe, expect, it } from "vitest";
import { Fraction } from "../../src/lib/calc/fraction";

describe("Fraction", () => {
	it("既約・分母正に正規化される", () => {
		expect(Fraction.of(2, 4)).toEqual(Fraction.of(1, 2));
		expect(Fraction.of(1, -2)).toEqual(Fraction.of(-1, 2));
		expect(Fraction.of(-3, -6)).toEqual(Fraction.of(1, 2));
		expect(Fraction.of(0, 5)).toEqual(Fraction.of(0, 1));
	});

	it("十進表記(number / 文字列)から正確に変換される", () => {
		expect(Fraction.from(0.1)).toEqual(Fraction.of(1, 10));
		expect(Fraction.from("1.5")).toEqual(Fraction.of(3, 2));
		expect(Fraction.from("-0.25")).toEqual(Fraction.of(-1, 4));
		expect(Fraction.from("45")).toEqual(Fraction.of(45));
		expect(Fraction.from(" 2.0 ")).toEqual(Fraction.of(2));
	});

	it("解釈できない入力は RangeError になる", () => {
		expect(() => Fraction.from("1/3")).toThrow(RangeError);
		expect(() => Fraction.from("")).toThrow(RangeError);
		expect(() => Fraction.from(Number.NaN)).toThrow(RangeError);
		expect(() => Fraction.from(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Fraction.of(0.5)).toThrow(RangeError);
		expect(() => Fraction.of(1, 0)).toThrow(RangeError);
	});

	it("ceil は天井の整数値を返す", () => {
		expect(Fraction.of(3, 2).ceil()).toBe(2n);
		expect(Fraction.of(2).ceil()).toBe(2n);
		expect(Fraction.of(1, 3).ceil()).toBe(1n);
		expect(Fraction.of(0).ceil()).toBe(0n);
		expect(Fraction.of(-3, 2).ceil()).toBe(-1n);
		expect(Fraction.of(-2).ceil()).toBe(-2n);
	});

	it("四則演算が厳密に成立する", () => {
		const third = Fraction.of(1, 3);
		expect(third.add(third).add(third)).toEqual(Fraction.of(1));
		// float では 0.1 + 0.2 !== 0.3 になる式
		expect(Fraction.from(0.1).add(Fraction.from(0.2))).toEqual(
			Fraction.from(0.3),
		);
		expect(Fraction.of(3, 2).mul(Fraction.of(2, 3))).toEqual(Fraction.of(1));
		expect(Fraction.of(1, 2).div(Fraction.of(3))).toEqual(Fraction.of(1, 6));
		expect(() => Fraction.of(1).div(Fraction.of(0))).toThrow(RangeError);
	});

	it("十進文字列化は四捨五入し、末尾の 0 を落とす", () => {
		expect(Fraction.of(2, 3).toDecimalString(4)).toBe("0.6667");
		expect(Fraction.of(1, 2).toDecimalString(0)).toBe("1");
		expect(Fraction.of(-1, 8).toDecimalString(2)).toBe("-0.13");
		expect(Fraction.of(3, 2).toDecimalString(6)).toBe("1.5");
		expect(Fraction.of(45).toDecimalString(3)).toBe("45");
		expect(() => Fraction.of(1).toDecimalString(-1)).toThrow(RangeError);
	});

	it("toNumber / toString / isZero / isNegative", () => {
		expect(Fraction.of(3, 2).toNumber()).toBe(1.5);
		expect(Fraction.of(40, 3).toString()).toBe("40/3");
		expect(Fraction.of(45).toString()).toBe("45");
		expect(Fraction.of(0).isZero()).toBe(true);
		expect(Fraction.of(1, 2).isZero()).toBe(false);
		expect(Fraction.of(-1, 2).isNegative()).toBe(true);
		expect(Fraction.of(1, 2).isNegative()).toBe(false);
	});
});
