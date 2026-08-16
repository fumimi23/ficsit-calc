// 原料合計から採取設備の必要台数と電力を逆算する(issue #23)。
// 原料ノードで終端していた採取を「建てるもの」として数えるための計算コア。
// 台数は切り上げない: 端数の 1 台は部分負荷で回るので、電力を定格 × 建設台数で
// 見積もると要らない電力まで数えてしまう(丸めは表示側の関心事)。
import { Fraction } from "./fraction";
import type { ExtractorId, ItemId, ItemRate, RecipeData } from "./types";

/**
 * 同じ資源を複数の設備が採れるとき(固体資源の採鉱機 Mk.1〜3)に選ぶ既定。
 * issue #23: ノード純度「普通」・採鉱機 Mk.2 を固定の仮定とし、UI に明示する
 * (純度・マークを選ばせる設定 UI はフォローアップ issue)。
 */
export const ASSUMED_MINER_ID = "Build_MinerMk2_C";

/** 原料 1 種に対する採取設備の必要数 */
export interface ExtractorRequirement {
	item: ItemId;
	extractor: ExtractorId;
	/** 設備台数。端数のまま保持する(丸め・建設台数は表示側の関心事) */
	count: Fraction;
	/** 消費電力(MW) = count × 設備の定格 */
	powerMW: Fraction;
}

/**
 * 原料合計から採取設備の必要数を、rawMaterials の並び順のまま返す。
 * 採取設備を持たない資源(窒素ガスなど資源井でしか採れないもの)は行を出さない:
 * 0 台の行を出すと「設備なしで採れる」と読めてしまう。
 */
export function planExtractors(
	data: RecipeData,
	rawMaterials: ItemRate[],
): ExtractorRequirement[] {
	const requirements: ExtractorRequirement[] = [];
	for (const raw of rawMaterials) {
		const candidates = data.extractors.filter((extractor) =>
			extractor.resources.includes(raw.item),
		);
		if (candidates.length === 0) continue;

		const extractor =
			candidates.length === 1
				? candidates[0]
				: candidates.find((c) => c.id === ASSUMED_MINER_ID);
		// 決められないまま先頭を採ると、台数・電力が黙って別物になる
		if (!extractor) {
			throw new Error(
				`採取設備の候補が複数あるのに既定(${ASSUMED_MINER_ID})がありません: ${raw.item}`,
			);
		}

		const count = raw.ratePerMinute.div(Fraction.from(extractor.ratePerMinute));
		requirements.push({
			item: raw.item,
			extractor: extractor.id,
			count,
			powerMW: count.mul(Fraction.from(extractor.powerMW)),
		});
	}
	return requirements;
}

/**
 * 採取分の合計電力(MW)。総電力への合算は UI 層で行う
 * (ProductionPlan.totalPowerMW は製造分のみ、という意味を保つため)。
 */
export function sumExtractorPowerMW(
	requirements: ExtractorRequirement[],
): Fraction {
	return requirements.reduce(
		(total, requirement) => total.add(requirement.powerMW),
		Fraction.of(0),
	);
}
