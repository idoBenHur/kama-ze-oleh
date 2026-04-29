import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const rawDir = path.join(workspaceRoot, "data", "raw");
const catalogDir = path.join(workspaceRoot, "data", "catalog");

const defaultColors = ["#f05a28", "#d81f32", "#009845", "#0b6e99", "#1f6eea", "#6b8e23"];
const chainOverrides = {
  "7290027600007-2": {
    include: true,
    nameHe: "שופרסל",
    shortNameHe: "שופרסל",
    storeLabelHe: "דיל חיפה- גרנד קניון",
    cityHe: "חיפה"
  },
  "7290661400001-1": {
    include: true,
    nameHe: "מחסני השוק",
    shortNameHe: "מחסני השוק",
    storeLabelHe: "פסגת זאב מזרח ירושלים",
    cityHe: "ירושלים"
  },
  "7290696200003-1": {
    include: true,
    nameHe: "ויקטורי",
    shortNameHe: "ויקטורי",
    storeLabelHe: "דיזנגוף",
    cityHe: "תל אביב"
  },
  "7290455000004-1": {
    include: false
  }
};

function getArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }
  return process.argv[index + 1];
}

async function loadXmlJs() {
  const candidates = [
    "xml-js",
    process.env.CODEX_NODE_MODULES ? path.join(process.env.CODEX_NODE_MODULES, "xml-js") : null,
    path.join(
      process.env.USERPROFILE ?? "C:\\Users\\Ido",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules",
      "xml-js"
    )
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Could not load xml-js. Install it or expose it through CODEX_NODE_MODULES.");
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat();
}

function maybeGunzip(buffer, filePath) {
  const isGzip = filePath.toLowerCase().endsWith(".gz") || (buffer[0] === 0x1f && buffer[1] === 0x8b);
  return isGzip ? zlib.gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
}

function getText(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return getText(value[0]);
  }
  if (typeof value === "object") {
    if ("_text" in value) {
      return String(value._text).trim();
    }
    if ("_cdata" in value) {
      return String(value._cdata).trim();
    }
  }
  return null;
}

function normalizeCodePart(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    return String(Number(text));
  }

  return text;
}

function cleanupDisplayText(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}%]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function caseInsensitiveValue(record, fieldName) {
  const lowerFieldName = fieldName.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === lowerFieldName) {
      return value;
    }
  }
  return null;
}

function pickText(record, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = getText(caseInsensitiveValue(record, fieldName));
    if (value) {
      return value;
    }
  }
  return null;
}

function pickNumber(record, fieldNames) {
  const text = pickText(record, fieldNames);
  if (!text) {
    return null;
  }
  const normalized = text.replace(",", ".").replace(/[^\d.-]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function findNodes(value, nodeName) {
  const matches = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      matches.push(...findNodes(item, nodeName));
    }
    return matches;
  }
  if (!value || typeof value !== "object") {
    return matches;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === nodeName.toLowerCase()) {
      if (Array.isArray(child)) {
        matches.push(...child);
      } else {
        matches.push(child);
      }
    }
    matches.push(...findNodes(child, nodeName));
  }

  return matches;
}

function formatSize(record) {
  const quantity = pickText(record, ["Quantity", "Qty", "ItemQuantity", "QuantityInUnit"]);
  const unit = pickText(record, ["QuantityUnit", "UnitQty", "UnitOfMeasure", "MeasureUnit"]);
  if (!quantity && !unit) {
    return null;
  }
  return [quantity, unit].filter(Boolean).join(" ");
}

function extractFileContext(record) {
  const candidates = [record];

  for (const value of Object.values(record ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      candidates.push(value);
    }
  }

  let chainNameHe = null;
  let storeId = null;
  let chainId = null;

  for (const candidate of candidates) {
    chainNameHe = chainNameHe ?? pickText(candidate, ["ChainName", "ChainNameHebrew", "StoreChainName"]);
    storeId = storeId ?? normalizeCodePart(pickText(candidate, ["StoreId", "Storeid", "StoreID"]));

    const candidateChainCode = pickText(candidate, ["ChainId", "Chainid", "ChainID"]);
    if (!chainId && candidateChainCode) {
      chainId = buildChainId(candidate, chainNameHe);
    }
  }

  return {
    chainId: chainId ?? "chain",
    chainNameHe: chainNameHe ?? null,
    storeId: storeId ?? null
  };
}

function buildChainId(record, chainNameHe) {
  const chainCode = pickText(record, ["ChainId", "Chainid", "ChainID"]);
  const subChainCode = normalizeCodePart(
    pickText(record, ["SubChainId", "SubChainid", "SubChainID"])
  );
  if (chainCode) {
    return subChainCode ? `${chainCode}-${subChainCode}` : chainCode;
  }
  const safeName = (chainNameHe ?? "chain")
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
  return safeName || `chain-${Math.random().toString(36).slice(2, 8)}`;
}

function medianEntry(entries) {
  const sorted = [...entries].sort((left, right) => left.price - right.price);
  return sorted[Math.floor(sorted.length / 2)];
}

async function parseXmlFile(filePath, xmlJs) {
  const rawBuffer = await readFile(filePath);
  let xmlText = maybeGunzip(rawBuffer, filePath);

  // Some retailer store files are malformed in production: they close </Branches>
  // but omit the opening <Branches> wrapper.
  if (
    xmlText.includes("</Branches>") &&
    !xmlText.includes("<Branches>") &&
    xmlText.includes("<Store") &&
    xmlText.includes("<Branch>")
  ) {
    xmlText = xmlText.replace(/(<Store\b[^>]*>)/i, "$1\n  <Branches>");
  }

  return xmlJs.xml2js(xmlText, { compact: true, trim: true });
}

function parseStoreRecords(storeNodes) {
  const storeMap = new Map();

  for (const store of storeNodes) {
    const chainNameHe = pickText(store, ["ChainName", "ChainNameHebrew", "StoreChainName"]);
    const storeNameHe = pickText(store, ["StoreName", "StoreNameHebrew"]);
    const cityHe = pickText(store, ["City", "Town"]);
    const storeId = normalizeCodePart(pickText(store, ["StoreId", "Storeid", "StoreID"]));
    const chainId = buildChainId(store, chainNameHe);

    if (!storeId) {
      continue;
    }

    const key = `${chainId}:${storeId}`;
    storeMap.set(key, {
      chainId,
      chainNameHe: chainNameHe ?? chainId,
      storeId,
      storeNameHe: storeNameHe ?? `סניף ${storeId}`,
      cityHe: cityHe ?? null
    });
  }

  return storeMap;
}

function parsePriceRecords(itemNodes, storeMap, sourceFile, fileContext = {}) {
  const parsed = [];

  for (const item of itemNodes) {
    const barcode = pickText(item, ["ItemCode", "Itemcode", "ItemID", "Barcode"]);
    const price = pickNumber(item, ["ItemPrice", "Price", "ItemPriceUpdate"]);
    const storeId =
      normalizeCodePart(pickText(item, ["StoreId", "Storeid", "StoreID"])) ??
      fileContext.storeId ??
      null;
    const itemChainCode = pickText(item, ["ChainId", "Chainid", "ChainID"]);
    const chainNameHe =
      pickText(item, ["ChainName", "ChainNameHebrew", "StoreChainName"]) ??
      fileContext.chainNameHe ??
      null;
    const chainId = itemChainCode ? buildChainId(item, chainNameHe) : fileContext.chainId;
    const store = storeId ? storeMap.get(`${chainId}:${storeId}`) : null;

    if (!barcode || price == null) {
      continue;
    }

    parsed.push({
      barcode,
      canonicalNameHe: pickText(item, ["ItemName", "ManufacturerItemDescription", "ItemNm"]),
      brandHe: pickText(item, ["ManufacturerName", "ManufactureName", "BrandName"]),
      sizeHe: formatSize(item),
      chainId: store?.chainId ?? chainId,
      chainNameHe: store?.chainNameHe ?? chainNameHe ?? chainId,
      storeLabelHe: store?.storeNameHe ?? (storeId ? `סניף ${storeId}` : "ללא סניף"),
      cityHe: store?.cityHe ?? null,
      price,
      unitPrice: pickNumber(item, ["UnitOfMeasurePrice", "UnitPrice"]),
      sourceFile
    });
  }

  return parsed;
}

function uniqueNodeSet(...groups) {
  const seen = new Set();
  const merged = [];

  for (const group of groups) {
    for (const node of group) {
      if (!node || typeof node !== "object") {
        continue;
      }

      if (seen.has(node)) {
        continue;
      }

      seen.add(node);
      merged.push(node);
    }
  }

  return merged;
}

function aggregateCatalog(priceRecords) {
  const productsByBarcode = new Map();
  const chainRegistry = new Map();
  const importedAt = new Date().toISOString();

  for (const record of priceRecords) {
    const override = chainOverrides[record.chainId];
    if (override?.include === false) {
      continue;
    }

    const resolvedChainName = override?.nameHe ?? record.chainNameHe;

    if (!productsByBarcode.has(record.barcode)) {
      productsByBarcode.set(record.barcode, {
        id: record.barcode,
        barcode: record.barcode,
        canonicalNameHe: cleanupDisplayText(record.canonicalNameHe) ?? record.barcode,
        brandHe: cleanupDisplayText(record.brandHe) ?? null,
        sizeHe: cleanupDisplayText(record.sizeHe) ?? null,
        categoryHe: null,
        descriptionHe: cleanupDisplayText(record.canonicalNameHe) ?? record.barcode,
        image: {
          url: null,
          exact: false,
          license: null,
          sourceName: null
        },
        sourceStatus: "official",
        sourceUpdatedAt: importedAt,
        pricesByChain: []
      });
    }

    if (!chainRegistry.has(record.chainId)) {
      chainRegistry.set(record.chainId, {
        id: record.chainId,
        nameHe: resolvedChainName,
        shortNameHe: override?.shortNameHe ?? resolvedChainName,
        color: defaultColors[chainRegistry.size % defaultColors.length]
      });
    }

    productsByBarcode.get(record.barcode).pricesByChain.push({
      ...record,
      chainNameHe: resolvedChainName,
      storeLabelHe: override?.storeLabelHe ?? record.storeLabelHe,
      cityHe: override?.cityHe ?? record.cityHe
    });
  }

  const products = [...productsByBarcode.values()]
    .map((product) => {
      const groupedByChain = new Map();
      for (const priceEntry of product.pricesByChain) {
        const existing = groupedByChain.get(priceEntry.chainId) ?? [];
        existing.push(priceEntry);
        groupedByChain.set(priceEntry.chainId, existing);
      }

      product.pricesByChain = [...groupedByChain.entries()].map(([, entries]) => {
        const representative = medianEntry(entries);
        return {
          chainId: representative.chainId,
          chainNameHe: representative.chainNameHe,
          storeLabelHe:
            entries.length > 1 ? `חציון ${entries.length} סניפים` : representative.storeLabelHe,
          cityHe: entries.length > 1 ? "ארצי" : representative.cityHe,
          price: Number(representative.price.toFixed(2)),
          unitPrice: representative.unitPrice ?? null,
          collectedAt: importedAt
        };
      });

      return product;
    })
    .filter((product) => product.pricesByChain.length >= 2)
    .sort((left, right) => left.canonicalNameHe.localeCompare(right.canonicalNameHe, "he"));

  const chains = [...chainRegistry.values()].sort((left, right) =>
    left.nameHe.localeCompare(right.nameHe, "he")
  );

  return {
    meta: {
      mode: "official",
      source: "price-transparency-import",
      sourceLabelHe: "קבצי מחירים רשמיים",
      updatedAt: importedAt,
      noteHe: "הקטלוג נבנה מקבצי PriceFull ו-Stores שיובאו ידנית."
    },
    chains,
    products
  };
}

async function main() {
  const xmlJs = await loadXmlJs();
  const files = await walkFiles(rawDir);
  const storeFiles = files.filter((filePath) => /stores/i.test(path.basename(filePath)));
  const priceFiles = files.filter((filePath) => /pricefull/i.test(path.basename(filePath)));

  if (!priceFiles.length) {
    throw new Error("No PriceFull files were found under data/raw.");
  }

  const storeMap = new Map();
  for (const filePath of storeFiles) {
    const xml = await parseXmlFile(filePath, xmlJs);
    const storeNodes = uniqueNodeSet(findNodes(xml, "Store"), findNodes(xml, "Branch"));
    const parsedStores = parseStoreRecords(storeNodes);
    for (const [key, value] of parsedStores.entries()) {
      storeMap.set(key, value);
    }
  }

  const allPriceRecords = [];
  for (const filePath of priceFiles) {
    const xml = await parseXmlFile(filePath, xmlJs);
    const itemNodes = uniqueNodeSet(findNodes(xml, "Item"), findNodes(xml, "Product"));
    const fileContext = extractFileContext(xml);
    allPriceRecords.push(
      ...parsePriceRecords(itemNodes, storeMap, path.basename(filePath), fileContext)
    );
  }

  const catalog = aggregateCatalog(allPriceRecords);
  const outputPath = getArgValue(
    "--output",
    path.join(catalogDir, "imported-catalog.json")
  );

  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  console.log(`Imported ${catalog.products.length} products across ${catalog.chains.length} chains.`);
  console.log(`Catalog: ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
