// 誤差のない分数(有理数)演算。計算コアの数値表現(issue #6)。
// レシピ計算は 1/3 や 0.1 など二進小数で表現できない値が頻出するため、
// float ではなく BigInt の分子/分母で厳密に保持する。

const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function gcd(a: bigint, b: bigint): bigint {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

function toBigInt(value: bigint | number, label: string): bigint {
	if (typeof value === "bigint") return value;
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`${label}は整数で指定してください: ${value}`);
	}
	return BigInt(value);
}

/** 既約・分母正に正規化された不変の分数 */
export class Fraction {
	/** 分子。符号はここに持つ */
	readonly num: bigint;
	/** 分母。常に正 */
	readonly den: bigint;

	private constructor(num: bigint, den: bigint) {
		this.num = num;
		this.den = den;
	}

	/** 分子・分母(整数)から作る。分母の既定は 1 */
	static of(num: bigint | number, den: bigint | number = 1n): Fraction {
		return Fraction.normalize(toBigInt(num, "分子"), toBigInt(den, "分母"));
	}

	/**
	 * 十進表記(number または "1.5" のような文字列)から正確に変換する。
	 * number は String() の最短往復表現を経由するため、JSON や UI 入力に
	 * 書かれた十進リテラルがそのまま分数になる(例: 0.1 → 1/10)。
	 */
	static from(value: number | string): Fraction {
		if (typeof value === "number" && !Number.isFinite(value)) {
			throw new RangeError(`有限の数値ではありません: ${value}`);
		}
		const text = typeof value === "number" ? String(value) : value.trim();
		const m = DECIMAL_RE.exec(text);
		if (!m) {
			throw new RangeError(`十進表記として解釈できません: ${value}`);
		}
		const [, sign, intPart, fracPart = ""] = m;
		const digits = BigInt(intPart + fracPart);
		return Fraction.normalize(
			sign === "-" ? -digits : digits,
			10n ** BigInt(fracPart.length),
		);
	}

	private static normalize(num: bigint, den: bigint): Fraction {
		if (den === 0n) {
			throw new RangeError("分母が 0 の分数は作れません");
		}
		const signedNum = den < 0n ? -num : num;
		const positiveDen = den < 0n ? -den : den;
		const g = gcd(signedNum, positiveDen);
		return g === 0n
			? new Fraction(0n, 1n)
			: new Fraction(signedNum / g, positiveDen / g);
	}

	add(other: Fraction): Fraction {
		return Fraction.normalize(
			this.num * other.den + other.num * this.den,
			this.den * other.den,
		);
	}

	mul(other: Fraction): Fraction {
		return Fraction.normalize(this.num * other.num, this.den * other.den);
	}

	div(other: Fraction): Fraction {
		if (other.num === 0n) {
			throw new RangeError("0 で除算はできません");
		}
		return Fraction.normalize(this.num * other.den, this.den * other.num);
	}

	equals(other: Fraction): boolean {
		return this.num === other.num && this.den === other.den;
	}

	isZero(): boolean {
		return this.num === 0n;
	}

	isNegative(): boolean {
		return this.num < 0n;
	}

	/** 近似値。グラフ描画など誤差が許容できる用途のみに使う */
	toNumber(): number {
		return Number(this.num) / Number(this.den);
	}

	/** "40/3" / 整数なら "45" */
	toString(): string {
		return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`;
	}

	/** 指定桁で四捨五入した十進文字列。末尾の 0 は落とす(例: 40/3 → 4 桁で "13.3333"、3/2 → "1.5") */
	toDecimalString(maxFractionDigits = 6): string {
		if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0) {
			throw new RangeError(`桁数は 0 以上の整数で指定してください: ${maxFractionDigits}`);
		}
		const scale = 10n ** BigInt(maxFractionDigits);
		const abs = this.num < 0n ? -this.num : this.num;
		// |num|/den × scale を四捨五入(ゼロから遠い側へ)
		const scaled = (abs * scale * 2n + this.den) / (this.den * 2n);
		const intPart = scaled / scale;
		const fracPart = (scaled % scale)
			.toString()
			.padStart(maxFractionDigits, "0")
			.replace(/0+$/, "");
		const sign = this.num < 0n && scaled !== 0n ? "-" : "";
		return fracPart === ""
			? `${sign}${intPart}`
			: `${sign}${intPart}.${fracPart}`;
	}
}
