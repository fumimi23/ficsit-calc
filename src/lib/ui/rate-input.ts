// 目標レート入力の正規化(issue #8)。
// 人間が打ちがちな表記(".5" / "5." / 前後空白)を、コアの Fraction.from が受理する
// 十進文字列へ吸収する。コアの受理域は変えない(Fraction.from の doc コメント参照)。

export type RateInputResult =
	| { ok: true; value: string }
	| { ok: false; message: string };

// 先頭 + は許容。"." 単独は不可(整数部か小数部の少なくとも一方が要る)
const INPUT_RE = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;

/** 入力欄の生文字列を検証し、受理できれば正規化済みの十進文字列を返す */
export function normalizeRateInput(raw: string): RateInputResult {
	const text = raw.trim();
	if (text === "") {
		return { ok: false, message: "目標レートを入力してください" };
	}
	if (text.startsWith("-")) {
		return { ok: false, message: "生産レートは 0 以上で入力してください" };
	}
	const m = INPUT_RE.exec(text);
	if (!m) {
		return {
			ok: false,
			message: "数値を十進表記で入力してください(例: 30、7.5、0.5)",
		};
	}
	const [, intPart, fracTail, fracOnly] = m;
	const integer = intPart ?? "0";
	const fraction = fracOnly ?? fracTail ?? "";
	return {
		ok: true,
		value: fraction === "" ? integer : `${integer}.${fraction}`,
	};
}
