// 流量を運ぶのに要る搬送設備(ベルト・パイプ)の段と本数を選ぶ。
// 「1 エッジ = コンベア 1 本」という暗黙の前提は送量上限で崩れるので、
// 接続図のエッジ注記はこの判定を通す。
import { Fraction } from "./fraction";
import type { ItemId, RecipeData, TransportDef } from "./types";

export interface TransportRequirement {
	/** 選ばれた段。1 本で運べるなら最低の Mk、最大 Mk でも足りないなら最大の Mk */
	transport: TransportDef;
	/** 必要本数。最大 Mk でも 1 本で運べないときだけ 2 以上になる */
	lines: number;
}

/**
 * 流量を運べる最低の段を選ぶ。固体はベルト、液体・気体はパイプの表を見る。
 * 段が 1 つも収録されていないデータ(搬送設備を持たないローカル fixture)では
 * undefined を返し、呼び出し側を注記なしに縮退させる。
 */
export function selectTransport(
	data: RecipeData,
	item: ItemId,
	ratePerMinute: Fraction,
): TransportRequirement | undefined {
	const form = data.items[item]?.form;
	// 実データは全アイテムに form が入っている。未指定は固体として扱う
	const candidates =
		form === "liquid" || form === "gas" ? data.pipes : data.belts;

	let lowestEnough: TransportDef | undefined;
	let highest: TransportDef | undefined;
	for (const transport of candidates) {
		if (highest === undefined || transport.tier > highest.tier) {
			highest = transport;
		}
		if (linesOf(ratePerMinute, transport) > 1) continue;
		if (lowestEnough === undefined || transport.tier < lowestEnough.tier) {
			lowestEnough = transport;
		}
	}

	if (lowestEnough) return { transport: lowestEnough, lines: 1 };
	if (highest === undefined) return undefined;
	return { transport: highest, lines: linesOf(ratePerMinute, highest) };
}

/**
 * 流量を 1 段ぶんの上限で割った切り上げ本数。
 * 近似(toNumber)で割ると上限をわずかに超える流量が 1 本に丸まるので、分数のまま割る。
 */
function linesOf(ratePerMinute: Fraction, transport: TransportDef): number {
	return Number(
		ratePerMinute.div(Fraction.from(transport.ratePerMinute)).ceil(),
	);
}
