// ゲーム同梱 Docs(CommunityResources/Docs/<ロケール>.json)を RecipeData に変換する。
// 既存 npm の satisfactory-docs-parser を使わないのは、ゲーム 1.0 以降への対応が
// 未確認でテストも無いため。
//
// 含めないものの判断:
// - 可変電力の機械(粒子加速器等)とそのレシピ: 消費電力がレシピごとに変わり、機械単位の
//   定格 powerMW では表せない。誤った電力を出すより v1 では丸ごと対象外にする
// - 液体・気体の数量: Docs はリットル表記だがゲーム内 UI・既存ツールは m³ なので ÷1000 する
import type {
	BuildingDef,
	ExactNumeric,
	ItemDef,
	RecipeData,
	RecipeDef,
	RecipeIngredient,
} from "../calc/types";

/** UTF-16LE(BOM 付き)の Docs ファイルを文字列に復号する */
export function decodeDocs(buffer: Uint8Array): string {
	// BOM の手動除去はしない(TextDecoder が既定で取り除く)
	return new TextDecoder("utf-16le").decode(buffer);
}

/**
 * Docs の中身(復号済みテキスト)を RecipeData に変換する。
 * - enText: en-US.json(構造・数値・英語名の正本)
 * - jaText: ja.json(日本語表示名のみ利用)。省略時は nameJa なし
 */
export function parseDocs(enText: string, jaText?: string): RecipeData {
	const groups = parseGroups(enText);
	const jaNames = jaText ? buildDisplayNameIndex(parseGroups(jaText)) : null;

	// Descriptor 系の NativeClass は列挙しない(核燃料・バイオマス等に散らばっていて、
	// ゲーム更新で増える。全グループを索引してレシピが参照した ClassName から引くほうが壊れない)
	const descriptors = new Map<
		string,
		{ name: string; form?: ItemDef["form"] }
	>();
	for (const group of groups) {
		for (const entry of group.Classes) {
			const name = asString(entry.mDisplayName);
			if (!name) continue;
			descriptors.set(entry.ClassName, {
				name,
				form: parseForm(asString(entry.mForm)),
			});
		}
	}

	const buildings = new Map<string, BuildingDef>();
	for (const group of groups) {
		// endsWith の末尾クォートまで含めた一致により、FGBuildableManufacturerVariablePower
		// (可変電力)はここに入らない
		if (!group.NativeClass.endsWith(".FGBuildableManufacturer'")) continue;
		for (const entry of group.Classes) {
			buildings.set(entry.ClassName, {
				name: requireString(
					entry.mDisplayName,
					`${entry.ClassName}.mDisplayName`,
				),
				...jaName(jaNames, entry.ClassName),
				powerMW: parseDecimal(
					requireString(
						entry.mPowerConsumption,
						`${entry.ClassName}.mPowerConsumption`,
					),
				),
			});
		}
	}

	const recipes: RecipeDef[] = [];
	const referencedItems = new Set<string>();
	for (const group of groups) {
		if (!group.NativeClass.endsWith(".FGRecipe'")) continue;
		for (const entry of group.Classes) {
			const id = entry.ClassName;
			const name = requireString(entry.mDisplayName, `${id}.mDisplayName`);

			// ClassName 規約(Recipe_Alternate_*)では判定しない。ゲーム 1.0 でデフォルト化した
			// のに旧クラス名が残るレシピ(Recipe_Alternate_Turbofuel_C)があり、表示名の
			// "Alternate:" プレフィックスだけがスキマティックの解禁種別と全件一致するため
			if (name.startsWith("Alternate:")) {
				continue;
			}

			// 期間限定イベント(FICSMAS 等)のレシピは通常プレイで使えないため収録しない
			if (asString(entry.mRelevantEvents)) {
				continue;
			}

			const producedIn = parseClassNameList(asString(entry.mProducedIn) ?? "");
			const building = producedIn.find((b) => buildings.has(b));
			if (!building) continue;

			const toIngredients = (field: string): RecipeIngredient[] =>
				parseItemAmounts(asString(entry[field]) ?? "").map(
					({ item, amount }) => {
						referencedItems.add(item);
						return { item, amount: convertAmount(item, amount, descriptors) };
					},
				);

			recipes.push({
				id,
				name,
				...jaName(jaNames, id),
				building,
				durationSeconds: parseDecimal(
					requireString(
						entry.mManufactoringDuration,
						`${id}.mManufactoringDuration`,
					),
				),
				alternate: false,
				inputs: toIngredients("mIngredients"),
				outputs: toIngredients("mProduct"),
			});
		}
	}

	// 全 Descriptor は収録しない(データポリシー: 抽出は計算に必要な最小限)
	const items = new Map<string, ItemDef>();
	for (const id of referencedItems) {
		const desc = descriptors.get(id);
		if (!desc) {
			throw new Error(`レシピが参照するアイテムの定義が見つかりません: ${id}`);
		}
		items.set(id, {
			name: desc.name,
			...jaName(jaNames, id),
			...(desc.form ? { form: desc.form } : {}),
		});
	}

	// 出力順を安定させる(生成のたびに diff が出ないように)。
	// localeCompare は使わない(ICU/ロケール依存で環境により並びが変わりうるため)
	const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
	return {
		items: Object.fromEntries([...items].sort(([a], [b]) => byKey(a, b))),
		buildings: Object.fromEntries(
			[...buildings].sort(([a], [b]) => byKey(a, b)),
		),
		recipes: recipes.sort((a, b) => byKey(a.id, b.id)),
	};
}

// ---- Docs の生形式 ----

interface DocsGroup {
	NativeClass: string;
	Classes: DocsEntry[];
}

interface DocsEntry {
	ClassName: string;
	[key: string]: unknown;
}

function parseGroups(text: string): DocsGroup[] {
	const parsed: unknown = JSON.parse(text);
	if (!Array.isArray(parsed)) {
		throw new Error("Docs の形式が不正です: トップレベルが配列ではありません");
	}
	for (const group of parsed) {
		if (
			typeof group?.NativeClass !== "string" ||
			!Array.isArray(group?.Classes)
		) {
			throw new Error(
				"Docs の形式が不正です: NativeClass / Classes を持たない要素があります",
			);
		}
	}
	return parsed as DocsGroup[];
}

function buildDisplayNameIndex(groups: DocsGroup[]): Map<string, string> {
	const index = new Map<string, string>();
	for (const group of groups) {
		for (const entry of group.Classes) {
			const name = asString(entry.mDisplayName);
			if (name) index.set(entry.ClassName, name);
		}
	}
	return index;
}

/** nameJa が無いとき undefined 値を入れない(JSON.stringify で "nameJa": undefined を出さないため) */
function jaName(
	index: Map<string, string> | null,
	className: string,
): { nameJa?: string } {
	const nameJa = index?.get(className);
	return nameJa ? { nameJa } : {};
}

// "((ItemClass=\"...Desc_IronRod.Desc_IronRod_C'\",Amount=12),...)" 形式
const ITEM_AMOUNT_RE =
	/ItemClass="[^"]*\.([A-Za-z0-9_]+)'"\s*,\s*Amount=(\d+)/g;

function parseItemAmounts(text: string): { item: string; amount: number }[] {
	return [...text.matchAll(ITEM_AMOUNT_RE)].map((m) => ({
		item: m[1] as string,
		amount: Number(m[2]),
	}));
}

// mProducedIn: "(\"/Game/.../Build_AssemblerMk1.Build_AssemblerMk1_C\",...)" 形式
const CLASS_NAME_RE = /\.([A-Za-z0-9_]+_C)/g;

function parseClassNameList(text: string): string[] {
	return [...text.matchAll(CLASS_NAME_RE)].map((m) => m[1] as string);
}

/**
 * Docs の "60.000000" 形式を ExactNumeric に正規化する。
 * Number → String の最短往復表現は元の十進値を正確に保つ(Fraction.from と同じ前提)。
 */
function parseDecimal(text: string): ExactNumeric {
	const value = Number(text);
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`数値として解釈できません: ${text}`);
	}
	return value;
}

function parseForm(raw: string | undefined): ItemDef["form"] {
	switch (raw) {
		case "RF_SOLID":
			return "solid";
		case "RF_LIQUID":
			return "liquid";
		case "RF_GAS":
			return "gas";
		default:
			return undefined;
	}
}

/** 液体・気体の数量はリットル表記なので m³ に変換する(÷1000 は 3 桁までの十進で正確) */
function convertAmount(
	item: string,
	amount: number,
	descriptors: Map<string, { form?: ItemDef["form"] }>,
): number {
	const form = descriptors.get(item)?.form;
	return form === "liquid" || form === "gas" ? amount / 1000 : amount;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireString(value: unknown, label: string): string {
	const text = asString(value);
	if (text === undefined) {
		throw new Error(`Docs の必須フィールドがありません: ${label}`);
	}
	return text;
}
