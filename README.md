# tarsus-shopify-integration

# Tarsus → Shopify Integration

## 1. Project Overview

The Tarsus Shopify Integration connects the Tarsus supplier product feed to Shopify, allowing products to be imported and maintained automatically.

The integration is designed to reduce manual product management by synchronising product information from Tarsus into the Shopify store.

### Main Features

* Import products from the Tarsus XML product feed.
* Create new products in Shopify.
* Update existing products using their SKUs.
* Calculate selling prices using a configurable markup.
* Apply configurable stock quantity mapping.
* Import product images when supported by the product synchronisation code.
* Store product information, including descriptions, brands, categories and barcodes, where available.
* Set product status according to the project's configuration.
* Update inventory at the selected Shopify location.
* Support testing before running a full synchronisation.

## 2. Technologies Used

* **Node.js** — Runs the integration.
* **JavaScript** — Implements the integration logic.
* **Shopify Admin GraphQL API** — Communicates with Shopify.
* **Tarsus XML feed** — Supplies product information.
* **dotenv** — Loads environment variables from the `.env` file.
* **PowerShell** — Used to run commands on Windows.

## 3. Project Location

The project is stored locally at:

```text
C:\Users\tiffa\OneDrive\Desktop\tarsus-shopify-integration
```

To open the project in PowerShell:

```powershell
cd C:\Users\tiffa\OneDrive\Desktop\tarsus-shopify-integration
```

## 4. Requirements

Before running the integration, ensure you have:

* Node.js installed.
* Access to the Tarsus product feed.
* A Shopify store.
* A Shopify app configured with the necessary API permissions.
* The Shopify store domain and location ID.
* The required environment variables configured in `.env`.
* Internet access to reach the supplier feed and Shopify API.

## 5. Installation

Open PowerShell and navigate to the project folder:

```powershell
cd C:\Users\tiffa\OneDrive\Desktop\tarsus-shopify-integration
```

Install the project's dependencies:

```powershell
npm install
```

If the project already has its dependencies installed, this step may not be necessary.

## 6. Environment Configuration

Create or update the `.env` file in the project root.

The configuration may contain the following variables, depending on the requirements of the current source code:

```env
# Shopify configuration
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_API_VERSION=2026-07
SHOPIFY_LOCATION_ID=your-shopify-location-gid

# Shopify app credentials
SHOPIFY_CLIENT_ID=your-shopify-client-id
SHOPIFY_CLIENT_SECRET=your-shopify-client-secret

# Tarsus product feed
TARSUS_XML_FILE=./data/tarsus-products.xml
TARSUS_XML_URL=

# Product configuration
CREATE_AS_DRAFT=false

# Pricing
MARKUP_PERCENT=15

# Stock quantity mapping
STOCK_A=0
STOCK_B=10
STOCK_C=20

# Server configuration
PORT=4000
```

**Important:** This is an example configuration. Confirm each variable against the actual project code before using it. The example markup of 15% is not a confirmed business requirement; change it to the agreed markup.

Keep the actual Shopify credentials in your local `.env` file. Never commit real credentials, access tokens or client secrets to GitHub.

Add `.env` to `.gitignore`.

## 7. Tarsus Product Feed

The integration uses the Tarsus XML product feed as its source of product information.

The local feed is expected at:

```text
data\tarsus-products.xml
```

The project previously loaded a feed containing **3,351 products**.

The feed contains information used to identify products, calculate prices, determine stock quantities and obtain product images.

### Example Product Information

| Field           | Purpose                                |
| --------------- | -------------------------------------- |
| SKU             | Identifies the product                 |
| Title           | Product name                           |
| Supplier price  | Used to calculate the selling price    |
| Stock indicator | Used by the stock mapping logic        |
| Category        | Organises products                     |
| Image URL       | Provides a source for product images   |
| Barcode         | Identifies the product where available |

The actual fields and their mappings depend on the XML structure and the implementation in the project.

## 8. Pricing Logic

The integration can apply a configurable markup to supplier prices.

For example, with a supplier price of R1,000 and a markup of 15%:

```text
Supplier price: R1,000.00
Markup: 15%
Selling price: R1,150.00
```

The calculation is:

```text
Selling price = Supplier price × (1 + Markup percentage / 100)
```

The markup must be agreed with the store owner before the full synchronisation is run.

If VAT needs to be included in the selling price, confirm whether the supplier price already includes VAT and whether Shopify is configured to calculate tax at checkout. Do not apply VAT twice.

## 9. Stock Mapping

The project configuration previously used the following stock mapping:

| Tarsus stock indicator | Mapped Shopify quantity |
| ---------------------- | ----------------------: |
| A                      |                       0 |
| B                      |                      10 |
| C                      |                      20 |

These values are configurable examples from the project's setup and must match the intended stock policy.

Before running a full synchronisation, verify how the current code interprets the supplier's stock indicators. The mapped quantity may not represent the supplier's actual warehouse quantity.

## 10. Shopify Integration

The integration communicates with Shopify using the Shopify Admin GraphQL API.

The configured API version is:

```text
2026-07
```

The integration is intended to:

1. Connect to Shopify using the configured app credentials.
2. Read products from the Tarsus feed.
3. Identify existing Shopify products using their SKUs.
4. Create products that do not already exist.
5. Update matching products where supported.
6. Set inventory at the configured Shopify location.
7. Process product information in accordance with the current mapping logic.

The actual operations depend on the implementation of the project's JavaScript files and the permissions granted to the Shopify app.

## 11. Running the Integration

### Test Mode

The project has previously been run using:

```powershell
node .\src\server.js test
```

This command was used to test the integration.

Check the current `src\server.js` implementation to confirm what the `test` argument does before relying on it for a production-safe test.

### Start the Server

If the project is configured to run as a server, use:

```powershell
node .\src\server.js
```

The application may use port 4000, depending on its configuration.

### Full Synchronisation

Before running a full synchronisation, inspect the project files to identify the correct command and confirm whether it creates products, updates prices or changes inventory.

Do not assume that starting the server automatically synchronises all products.

## 12. Testing Checklist

Before importing the full catalogue, verify the following:

* [ ] The application loads the environment variables.
* [ ] The Tarsus XML feed can be read.
* [ ] The expected number of products is loaded.
* [ ] The Shopify connection succeeds.
* [ ] Product SKUs are mapped correctly.
* [ ] Supplier prices are converted correctly.
* [ ] The agreed markup is applied.
* [ ] Stock quantities are mapped correctly.
* [ ] Product images are imported where supported.
* [ ] Existing products are updated instead of duplicated.
* [ ] New products are created correctly.
* [ ] Inventory is assigned to the correct Shopify location.
* [ ] Product status and sales channels are correct.
* [ ] Errors are logged for review.

## 13. Troubleshooting

### Shopify Authentication Errors

If Shopify returns an authentication error:

1. Check the store domain in `.env`.
2. Verify that the Shopify app credentials are correct.
3. Confirm the app has the required API permissions.
4. Check that the app is installed and authorised for the store.
5. Restart the Node.js process after changing environment variables.

Never share client secrets or access tokens when requesting help.

### XML Feed Errors

If the XML feed cannot be loaded:

1. Confirm that `data\tarsus-products.xml` exists.
2. Check that the file is valid XML.
3. Confirm the configured file path.
4. If using a remote feed, verify that the feed URL is active and accessible.

### Products Are Not Found

If existing products are not matched:

1. Check the supplier SKU in the XML feed.
2. Check the corresponding Shopify variant SKU.
3. Look for extra spaces or differences in SKU formatting.
4. Review the application's SKU search logic.

### Incorrect Prices

If prices are incorrect:

1. Confirm the supplier price.
2. Check the configured markup.
3. Verify the price calculation in the mapper.
4. Check whether VAT is already included in the supplier price.
5. Confirm Shopify tax settings.
6. Test with a small number of products before updating the full catalogue.

### Incorrect Inventory

If inventory is incorrect:

1. Confirm the supplier's stock indicator or quantity.
2. Check the stock mapping rules.
3. Verify the Shopify location ID.
4. Confirm the app has the necessary inventory permissions.
5. Check the inventory update logs.

## 14. Security

The following practices should be followed:

* Keep `.env` out of version control.
* Do not publish Shopify credentials.
* Do not commit supplier credentials or private feed URLs.
* Use only the API permissions required by the integration.
* Test changes before running a full catalogue synchronisation.
* Review logs for errors and unexpected product changes.

## 15. Future Improvements

Possible future improvements include:

* Scheduled automatic product synchronisation.
* Automatic price updates.
* Automatic inventory updates.
* Improved image handling.
* Product category mapping.
* Duplicate SKU detection.
* Retry logic for temporary API errors.
* Detailed synchronisation reports.
* Notifications when a synchronisation fails.
* A dashboard showing products created, updated and skipped.

## 16. Project Status

The project has previously loaded a local Tarsus XML feed containing 3,351 products.

The integration has also been developed to connect to Shopify and map product information.

However, the successful completion of a full production synchronisation, including product images, inventory, pricing and publication status, must be verified against the current code and Shopify store.

---

**Project:** Tarsus → Shopify Integration
**Purpose:** Automate supplier product synchronisation
**Runtime:** Node.js
**Destination:** Shopify Admin API
