import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const catalogDir = path.join(workspaceRoot, "data", "catalog");
const publicCatalogPath = path.join(workspaceRoot, "public", "data", "catalog.json");

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
      if (chainMap.has(entry.chainId)) {
        continue;
      }

      chainMap.set(entry.chainId, {
        id: entry.chainId,
        nameHe: entry.chainNameHe ?? entry.chainId,
        shortNameHe: entry.chainNameHe ?? entry.chainId,
        color: "#4c5b6b"
      });
    }
  }

  return [...chainMap.values()];
}

async function main() {
  const sourcePath =
    (await firstExistingPath([
      path.join(catalogDir, "imported-catalog.json"),
      path.join(catalogDir, "catalog.json")
    ])) ?? path.join(catalogDir, "catalog.json");

  const catalog = JSON.parse(await readFile(sourcePath, "utf8"));
  const products = (catalog.products ?? []).filter(
    (product) => (product.pricesByChain ?? []).length >= 2
  );
  const chains = deriveChains(products, catalog.chains);
  const updatedAt = getLatestTimestamp(products, catalog.meta?.updatedAt);

  const output = {
    meta: {
      mode: catalog.meta?.mode ?? "static",
      source: catalog.meta?.source ?? "catalog-file",
      sourceLabelHe: catalog.meta?.sourceLabelHe ?? "קטלוג סטטי",
      updatedAt,
      builtAt: new Date().toISOString(),
      productCount: products.length,
      chainCount: chains.length,
      noteHe: catalog.meta?.noteHe ?? null
    },
    chains,
    products
  };

  await writeFile(publicCatalogPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Built static catalog with ${products.length} products.`);
  console.log(`Output: ${publicCatalogPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
