import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const catalogDir = path.join(workspaceRoot, "data", "catalog");
const publicDataDir = path.join(workspaceRoot, "public", "data");

const OPEN_FOOD_FACTS_DELAY_MS = 700;
const FALLBACK_DELAY_MS = 80;

function getArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }
  return process.argv[index + 1];
}

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

async function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "KamaZeOleh/0.1 (local project image enrichment)"
    }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function requestHead(url) {
  const response = await fetch(url, {
    method: "HEAD",
    headers: {
      "User-Agent": "KamaZeOleh/0.1 (local project image enrichment)"
    }
  });

  return response.ok;
}

async function resolveImage(product) {
  if (!product.barcode) {
    return null;
  }

  const openFoodFactsPayload = await requestJson(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(product.barcode)}.json?fields=code,image_front_url,image_url,product_name`
  ).catch(() => null);

  const openFoodFactsImage =
    openFoodFactsPayload?.product?.image_front_url ?? openFoodFactsPayload?.product?.image_url ?? null;

  if (openFoodFactsImage) {
    await delay(OPEN_FOOD_FACTS_DELAY_MS);
    return {
      image: {
        url: openFoodFactsImage,
        exact: true,
        license: "CC BY-SA 4.0",
        sourceName: "Open Food Facts"
      },
      sourceKey: "open-food-facts"
    };
  }

  await delay(OPEN_FOOD_FACTS_DELAY_MS);

  const foodFactImageUrl = `https://foodfact.b-cdn.net//static/img/products/${encodeURIComponent(product.barcode)}.jpg`;
  const hasFoodFactImage = await requestHead(foodFactImageUrl).catch(() => false);

  if (!hasFoodFactImage) {
    await delay(FALLBACK_DELAY_MS);
    return null;
  }

  await delay(FALLBACK_DELAY_MS);
  return {
    image: {
      url: foodFactImageUrl,
      exact: true,
      license: null,
      sourceName: "FoodFact"
    },
    sourceKey: "foodfact"
  };
}

async function main() {
  const inputPath =
    getArgValue("--input", null) ??
    (await firstExistingPath([
      path.join(catalogDir, "imported-catalog.json"),
      path.join(catalogDir, "catalog.json")
    ]));
  const overridesPath = getArgValue("--overrides", path.join(catalogDir, "image-overrides.json"));

  if (!inputPath) {
    throw new Error("No catalog file was found.");
  }

  const outputPath = getArgValue("--output", inputPath);
  const publicOutputPath =
    getArgValue("--public-output", null) ??
    (path.basename(outputPath) === "popular-300-catalog.json"
      ? path.join(publicDataDir, "catalog-popular-300.json")
      : null);
  const catalog = JSON.parse(await readFile(inputPath, "utf8"));
  let imageOverrides = {};

  try {
    imageOverrides = JSON.parse(await readFile(overridesPath, "utf8"));
  } catch {
    imageOverrides = {};
  }

  const products = catalog.products ?? [];
  let enrichedCount = 0;
  let overrideCount = 0;
  let openFoodFactsCount = 0;
  let foodFactCount = 0;

  for (const product of products) {
    if (!product.barcode || product.image?.url) {
      continue;
    }

    const overrideImage = imageOverrides[product.barcode] ?? null;
    if (overrideImage?.url) {
      product.image = overrideImage;
      enrichedCount += 1;
      overrideCount += 1;
      continue;
    }

    const resolved = await resolveImage(product);
    if (!resolved) {
      continue;
    }

    product.image = resolved.image;
    enrichedCount += 1;

    if (resolved.sourceKey === "open-food-facts") {
      openFoodFactsCount += 1;
    }

    if (resolved.sourceKey === "foodfact") {
      foodFactCount += 1;
    }
  }

  catalog.products = products;

  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  if (publicOutputPath) {
    await writeFile(publicOutputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  }

  console.log(`Enriched ${enrichedCount} products with image data.`);
  console.log(`Overrides: ${overrideCount}`);
  console.log(`Open Food Facts: ${openFoodFactsCount}`);
  console.log(`FoodFact: ${foodFactCount}`);
  console.log(`Output: ${outputPath}`);
  if (publicOutputPath) {
    console.log(`Public output: ${publicOutputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
