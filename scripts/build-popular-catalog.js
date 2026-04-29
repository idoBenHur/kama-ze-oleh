import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const catalogDir = path.join(workspaceRoot, "data", "catalog");
const publicDataDir = path.join(workspaceRoot, "public", "data");

const sourcePathCandidates = [
  path.join(catalogDir, "imported-catalog.json"),
  path.join(catalogDir, "catalog.json"),
  path.join(publicDataDir, "catalog.json")
];

const curatedSourcePath = path.join(catalogDir, "popular-300-catalog.json");
const curatedPublicPath = path.join(publicDataDir, "catalog-popular-300.json");

const TARGET_COUNT = 300;
const STRICT_FAMILY_LIMIT = 2;
const RELAXED_FAMILY_LIMIT = 3;

const STOPWORDS = new Set([
  "של",
  "עם",
  "ללא",
  "בטעם",
  "בטעמ",
  "מארז",
  "יח",
  "יחידה",
  "יחידות",
  "גרם",
  "גר",
  "ג",
  "מ״ל",
  "מ\"ל",
  "מל",
  "ליטר",
  "ל",
  "קג",
  "ק\"ג",
  "קילו",
  "קטן",
  "גדול",
  "קלאסי",
  "מהדרין",
  "מעדן",
  "בקבוק",
  "פחית",
  "שישיה",
  "שלישיה"
]);

const EXCLUDED_KEYWORDS = [
  "בירה",
  "יין",
  "וודקה",
  "וויסקי",
  "קוניאק",
  "ברנדי",
  "ליקר",
  "טבק",
  "סיגר",
  "סיגריות",
  "מזון כלבים",
  "מזון חתולים",
  "חול לחתול",
  "קפסולות כביסה",
  "צבע לשיער",
  "תחליף חלב",
  "בקבוק האכלה",
  "מוצץ",
  "כשל\"פ",
  "כשלפ",
  "כשל פ",
  "קוויאר",
  "הרינג",
  "סלמון מעושן",
  "חזה בקר",
  "סרוולד",
  "דייסת",
  "פאולנר",
  "קורנדביף",
  "רוסטביף"
];

const SOFT_PENALTY_KEYWORDS = [
  "כשל\"פ",
  "כשלפ",
  "ללא גלוטן",
  "פרוטאין",
  "בריסטה",
  "טבעוני",
  "ללא לקטוז",
  "מועשר",
  "סופרייז",
  "מיני",
  "XXL",
  "XL"
];

const BRAND_BOOST_KEYWORDS = [
  "אסם",
  "תנובה",
  "שטראוס",
  "עלית",
  "יטבתה",
  "סוגת",
  "ויסוצקי",
  "טרה",
  "גד",
  "פיראוס",
  "סנפרוסט",
  "יופלה",
  "דנונה",
  "מילקי",
  "נעם",
  "עמק",
  "קוקה",
  "קולה",
  "ספרייט",
  "פאנטה",
  "נביעות",
  "מי עדן",
  "פריגת",
  "ספרינג",
  "סטארקיסט",
  "היינץ",
  "הלמנס",
  "לוטוס",
  "אוראו",
  "פרינגלס",
  "במבה",
  "ביסלי",
  "אפרופו",
  "קליק",
  "כיף כף",
  "פסק זמן",
  "מקופלת",
  "טורטית",
  "דוריטוס",
  "תלמה",
  "קורנפלקס"
];

const COMMON_SIZE_HINTS = [
  "1 ליטר",
  "1 ל",
  "500 גר",
  "500גר",
  "400 גר",
  "250 גר",
  "200 גר",
  "80 גר",
  "1 ק\"ג",
  "1 קג"
];

const GROUPS = [
  {
    id: "dairy",
    labelHe: "מוצרי חלב",
    targetCount: 45,
    baseScore: 96,
    keywords: [
      "חלב",
      "שוקו",
      "קוטג",
      "גבינה",
      "יוגורט",
      "יופלה",
      "דנונה",
      "אשל",
      "שמנת",
      "חמאה",
      "מילקי",
      "עמק",
      "פיראוס",
      "בולגרית",
      "מוצרלה",
      "ריקוטה",
      "צהובה",
      "אלפרו",
      "משקה סויה",
      "משקה שקדים",
      "משקה שיבולת",
      "נפוליאון",
      "כנען",
      "גלבוע",
      "ברי",
      "גאודה",
      "צדר",
      "קממבר",
      "ריויון"
    ]
  },
  {
    id: "bread",
    labelHe: "לחם ומאפים",
    targetCount: 20,
    baseScore: 82,
    keywords: ["לחם", "חלה", "לחמניה", "לחמניות", "פיתה", "פיתות", "טורטיה", "טוסט"]
  },
  {
    id: "pantry",
    labelHe: "מזווה ובישול",
    targetCount: 45,
    baseScore: 90,
    keywords: [
      "אורז",
      "פסטה",
      "אטריות",
      "איטריות",
      "פתיתים",
      "קוסקוס",
      "קמח",
      "סוכר",
      "מלח",
      "שמן",
      "קטשופ",
      "מיונז",
      "טחינה",
      "רוטב",
      "פירורי לחם",
      "רסק עגבניות",
      "בורגול",
      "גריסי",
      "עדשים",
      "פופקורן",
      "ממרח",
      "חרדל",
      "סירופ",
      "מרק",
      "קינואה",
      "שומשום",
      "קקאו",
      "פתיתי",
      "קרניים",
      "צדפות",
      "פרומנטי",
      "פסטו"
    ]
  },
  {
    id: "canned",
    labelHe: "שימורים וממרחים",
    targetCount: 20,
    baseScore: 84,
    keywords: [
      "טונה",
      "תירס",
      "אפונה",
      "שעועית",
      "זיתים",
      "זית",
      "מלפפון חמוץ",
      "מלפפון בחומץ",
      "חומוס",
      "טחינה",
      "ריבה",
      "דבש",
      "עגבניות מרוסקות",
      "סחוג",
      "קונפיטורה",
      "לימון כבוש",
      "כרוב כבוש",
      "פטריות"
    ]
  },
  {
    id: "drinks",
    labelHe: "שתיה",
    targetCount: 35,
    baseScore: 88,
    keywords: [
      "מים",
      "קולה",
      "קוקה",
      "ספרייט",
      "פאנטה",
      "תפוזינה",
      "ספרינג",
      "פריגת",
      "מיץ",
      "לימונדה",
      "סודה",
      "קפה",
      "תה",
      "אייס קפה",
      "אייס תה",
      "גטורייד",
      "סן בנדטו",
      "סאפה",
      "שוופס"
    ]
  },
  {
    id: "breakfast",
    labelHe: "בוקר ודגנים",
    targetCount: 15,
    baseScore: 80,
    keywords: [
      "קורנפלקס",
      "דגני",
      "גרנולה",
      "שיבולת שועל",
      "כריות",
      "קוואקר",
      "טריקס",
      "צ'ריוס",
      "צ׳ריוס",
      "קראנץ",
      "מולטי"
    ]
  },
  {
    id: "snacks",
    labelHe: "חטיפים ומתוקים",
    targetCount: 55,
    baseScore: 92,
    keywords: [
      "במבה",
      "ביסלי",
      "אפרופו",
      "דוריטוס",
      "צ'יטוס",
      "צ׳יטוס",
      "תפוציפס",
      "פרינגלס",
      "אוראו",
      "בייגלה",
      "קרקר",
      "עוגיות",
      "שוקולד",
      "קליק",
      "כיף כף",
      "פסק זמן",
      "מקופלת",
      "טורטית",
      "לוטוס",
      "ביסקויט",
      "וופל",
      "בייגל בייגל",
      "דובונים",
      "באונטי",
      "טוויקס",
      "לינדט",
      "מנטוס",
      "ערגליות",
      "עוגת",
      "כיפלי",
      "טורטינה",
      "טים טם",
      "נאצוס",
      "מסטיק",
      "סוכריה",
      "לקקן",
      "דגדג",
      "פתי בר",
      "ריטר",
      "ציטוס",
      "תפוצ",
      "לואקר"
    ]
  },
  {
    id: "frozen",
    labelHe: "קפואים",
    targetCount: 20,
    baseScore: 78,
    keywords: [
      "סנפרוסט",
      "מעדנות",
      "בורקס",
      "פיצה",
      "שניצל",
      "צ'יפס",
      "ציפס",
      "ירקות קפואים",
      "פירה",
      "קציצות",
      "טבעות בצל",
      "לזניה",
      "טורטליני",
      "גלידה",
      "בצק פילו",
      "קרמיסימו",
      "רביולי",
      "תרד"
    ]
  },
  {
    id: "home",
    labelHe: "ניקיון ונייר",
    targetCount: 25,
    baseScore: 72,
    keywords: [
      "נייר טואלט",
      "מגבות נייר",
      "נוזל כלים",
      "מרכך",
      "אבקת כביסה",
      "ג'ל כביסה",
      "ג׳ל כביסה",
      "אקונומיקה",
      "מסיר אבנית",
      "שקיות אשפה",
      "נייר אפיה",
      "נייר כסף",
      "אנטי קאלק",
      "אסטוניש",
      "וולייט",
      "טישו",
      "כרית יפנית",
      "מנקה אסלות",
      "סנו",
      "פיניש",
      "ניקוי כלים",
      "קליה",
      "ריצפז",
      "מילוי מבשם"
    ]
  },
  {
    id: "care",
    labelHe: "טיפוח אישי",
    targetCount: 20,
    baseScore: 68,
    keywords: [
      "משחת שיניים",
      "שמפו",
      "מרכך שיער",
      "סבון",
      "ג'ל רחצה",
      "ג׳ל רחצה",
      "דאודורנט",
      "מגבונים",
      "ממחטות",
      "סכיני גילוח",
      "וזלין",
      "מברשת שיניים",
      "קולגייט",
      "טמפונים",
      "מגבוני",
      "פנטן",
      "ספיד סטיק",
      "ג'ל פטרוליום",
      "ג׳ל פטרוליום"
    ]
  },
  {
    id: "general",
    labelHe: "מוצרים כלליים",
    targetCount: 20,
    baseScore: 12,
    keywords: []
  }
];

async function firstExistingPath(paths) {
  for (const filePath of paths) {
    try {
      await access(filePath);
      return filePath;
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeText(...parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/["'`׳״/\\()[\]{}*:+.,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function countMatches(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length;
}

function findLongestMatch(text, keywords) {
  return [...keywords]
    .sort((left, right) => right.length - left.length)
    .find((keyword) => text.includes(keyword.toLowerCase()));
}

function getLatestTimestamp(products, fallback) {
  const parsed = (products ?? [])
    .flatMap((product) => [
      product.sourceUpdatedAt,
      ...(product.pricesByChain ?? []).map((entry) => entry.collectedAt)
    ])
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value));

  if (!parsed.length) {
    return fallback ?? new Date().toISOString();
  }

  return new Date(Math.max(...parsed)).toISOString();
}

function deriveChains(products, explicitChains) {
  const chainMap = new Map((explicitChains ?? []).map((chain) => [chain.id, chain]));

  for (const product of products ?? []) {
    for (const entry of product.pricesByChain ?? []) {
      if (!chainMap.has(entry.chainId)) {
        chainMap.set(entry.chainId, {
          id: entry.chainId,
          nameHe: entry.chainNameHe ?? entry.chainId,
          shortNameHe: entry.chainNameHe ?? entry.chainId,
          color: "#4c5b6b"
        });
      }
    }
  }

  return [...chainMap.values()];
}

function classifyProduct(text) {
  for (const group of GROUPS) {
    if (!group.keywords.length) {
      continue;
    }

    const matchedKeyword = findLongestMatch(text, group.keywords);
    if (matchedKeyword) {
      return { group, matchedKeyword };
    }
  }

  return { group: GROUPS.at(-1), matchedKeyword: null };
}

function buildFamilyKey(product, classification) {
  if (classification?.matchedKeyword) {
    return `${classification.group.id}:${classification.matchedKeyword}`;
  }

  const normalizedName = normalizeText(product.canonicalNameHe);
  const tokens = normalizedName
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !/^\d/.test(token));

  return `misc:${tokens.slice(0, 3).join(" ") || product.barcode}`;
}

function calculateScore(product, text, classification) {
  const prices = (product.pricesByChain ?? [])
    .map((entry) => Number(entry.price))
    .filter((value) => Number.isFinite(value));

  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const priceSpread = Math.max(...prices) - Math.min(...prices);
  const keywordMatches = countMatches(text, classification?.group?.keywords ?? []);
  const brandMatches = countMatches(text, BRAND_BOOST_KEYWORDS);
  const penaltyMatches = countMatches(text, SOFT_PENALTY_KEYWORDS);
  const nameLength = (product.canonicalNameHe ?? "").length;

  let score = 0;
  score += (product.pricesByChain?.length ?? 0) >= 3 ? 220 : 120;
  score += classification?.group?.baseScore ?? 0;
  score += Math.min(keywordMatches * 7, 21);
  score += Math.min(brandMatches * 6, 24);
  score += Math.min(priceSpread * 12, 24);

  if (averagePrice >= 3 && averagePrice <= 30) {
    score += 42;
  } else if (averagePrice <= 50) {
    score += 18;
  } else if (averagePrice > 70) {
    score -= 18;
  }

  if (priceSpread >= 0.75 && priceSpread <= 7) {
    score += 12;
  }

  if (nameLength >= 10 && nameLength <= 52) {
    score += 14;
  } else if (nameLength > 72) {
    score -= 10;
  }

  if (includesAny(text, COMMON_SIZE_HINTS)) {
    score += 8;
  }

  score -= penaltyMatches * 8;

  return Number(score.toFixed(2));
}

function buildCandidate(product) {
  const text = normalizeText(
    product.canonicalNameHe,
    product.brandHe,
    product.descriptionHe,
    product.sizeHe
  );

  if (!text || includesAny(text, EXCLUDED_KEYWORDS)) {
    return null;
  }

  const classification = classifyProduct(text);
  const score = calculateScore(product, text, classification);

  return {
    product,
    text,
    score,
    classification,
    familyKey: buildFamilyKey(product, classification)
  };
}

function canSelect(candidate, selectedIds, familyCounts, familyLimit) {
  if (selectedIds.has(candidate.product.id)) {
    return false;
  }

  return (familyCounts.get(candidate.familyKey) ?? 0) < familyLimit;
}

function addSelection(candidate, selected, selectedIds, familyCounts) {
  const enrichedProduct = {
    ...candidate.product,
    curation: {
      popularGroupId: candidate.classification.group.id,
      popularGroupHe: candidate.classification.group.labelHe,
      heuristicScore: candidate.score
    }
  };

  selected.push(enrichedProduct);
  selectedIds.add(candidate.product.id);
  familyCounts.set(candidate.familyKey, (familyCounts.get(candidate.familyKey) ?? 0) + 1);
}

function selectFromCandidates(candidates, familyLimit) {
  const selected = [];
  const selectedIds = new Set();
  const familyCounts = new Map();

  const candidatesByGroup = new Map(
    GROUPS.map((group) => [
      group.id,
      candidates
        .filter((candidate) => candidate.classification.group.id === group.id)
        .sort((left, right) => right.score - left.score)
    ])
  );

  for (const group of GROUPS) {
    const bucket = candidatesByGroup.get(group.id) ?? [];
    for (const candidate of bucket) {
      if (selected.length >= TARGET_COUNT) {
        return selected;
      }

      const groupCount = selected.filter(
        (product) => product.curation?.popularGroupId === group.id
      ).length;

      if (groupCount >= group.targetCount) {
        break;
      }

      if (!canSelect(candidate, selectedIds, familyCounts, familyLimit)) {
        continue;
      }

      addSelection(candidate, selected, selectedIds, familyCounts);
    }
  }

  const remaining = [...candidates].sort((left, right) => right.score - left.score);
  for (const candidate of remaining) {
    if (selected.length >= TARGET_COUNT) {
      break;
    }

    if (!canSelect(candidate, selectedIds, familyCounts, familyLimit)) {
      continue;
    }

    addSelection(candidate, selected, selectedIds, familyCounts);
  }

  return selected;
}

function selectPopularProducts(products) {
  const primaryCandidates = products
    .filter((product) => (product.pricesByChain ?? []).length >= 3)
    .map(buildCandidate)
    .filter(Boolean);

  const fallbackCandidates = products
    .filter((product) => (product.pricesByChain ?? []).length === 2)
    .map(buildCandidate)
    .filter(Boolean);

  let selected = selectFromCandidates(primaryCandidates, STRICT_FAMILY_LIMIT);

  if (selected.length < TARGET_COUNT) {
    selected = selectFromCandidates(primaryCandidates, RELAXED_FAMILY_LIMIT);
  }

  if (selected.length < TARGET_COUNT) {
    selected = selectFromCandidates(
      [...primaryCandidates, ...fallbackCandidates],
      RELAXED_FAMILY_LIMIT
    );
  }

  return selected.sort((left, right) => {
    const leftGroup = left.curation?.popularGroupHe ?? "";
    const rightGroup = right.curation?.popularGroupHe ?? "";
    return (
      leftGroup.localeCompare(rightGroup, "he") ||
      (left.canonicalNameHe ?? "").localeCompare(right.canonicalNameHe ?? "", "he")
    );
  });
}

async function main() {
  const sourcePath = await firstExistingPath(sourcePathCandidates);
  if (!sourcePath) {
    throw new Error("Could not find a source catalog to build from.");
  }

  const catalog = JSON.parse(await readFile(sourcePath, "utf8"));
  const products = (catalog.products ?? []).filter(
    (product) => (product.pricesByChain ?? []).length >= 2
  );

  const selectedProducts = selectPopularProducts(products);
  if (selectedProducts.length < TARGET_COUNT) {
    throw new Error(`Only selected ${selectedProducts.length} products; expected ${TARGET_COUNT}.`);
  }

  const chains = deriveChains(selectedProducts, catalog.chains);
  const updatedAt = getLatestTimestamp(selectedProducts, catalog.meta?.updatedAt);
  const groupBreakdown = Object.fromEntries(
    GROUPS.map((group) => [
      group.id,
      selectedProducts.filter((product) => product.curation?.popularGroupId === group.id).length
    ])
  );

  const output = {
    meta: {
      mode: "curated",
      source: "popular-300-heuristic",
      sourceLabelHe: "300 מוצרים פופולריים",
      updatedAt,
      builtAt: new Date().toISOString(),
      productCount: selectedProducts.length,
      chainCount: chains.length,
      noteHe:
        "הקטלוג נבחר בצורה אוצרותית מתוך הקבצים הרשמיים, עם העדפה למוצרים מוכרים שמופיעים בכל שלוש הרשתות.",
      selectionHe:
        "אין כאן נתוני מכירות אמיתיים; זו בחירה מכוונת של מוצרים נפוצים ומוכרים למשחק טוב יותר.",
      groupBreakdown
    },
    chains,
    products: selectedProducts
  };

  await writeFile(curatedSourcePath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writeFile(curatedPublicPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Built curated catalog with ${selectedProducts.length} products.`);
  console.log(`Source output: ${curatedSourcePath}`);
  console.log(`Public output: ${curatedPublicPath}`);
  console.log("Breakdown:");
  for (const group of GROUPS) {
    console.log(`- ${group.labelHe}: ${groupBreakdown[group.id] ?? 0}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
