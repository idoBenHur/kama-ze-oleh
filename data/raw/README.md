# Raw Feeds

Put official retailer files here before running the importer.

Recommended layout:

- `data/raw/<chain-name>/Stores*.xml`
- `data/raw/<chain-name>/Stores*.gz`
- `data/raw/<chain-name>/PriceFull*.xml`
- `data/raw/<chain-name>/PriceFull*.gz`

The importer is tolerant about the exact directory structure and scans recursively.

After importing official files, rebuild the deployable catalog:

- `node scripts/import-price-files.js`
- `node scripts/build-static-catalog.js`
