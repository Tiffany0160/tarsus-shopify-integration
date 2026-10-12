'use strict';

require('dotenv').config();

const { TarsusClient } = require('./tarsus/client');
const { ShopifyClient } = require('./shopify/client');

function printVerification(shopify, verification) {
    console.log(`SKU:       ${verification.sku}`);
    console.log(`Price:     R${verification.price}`);
    console.log(`Inventory: ${shopify.getAvailableAtLocation(verification)}`);
}

async function main() {
    console.log('');
    console.log('======================================');
    console.log(' TARSUS → SHOPIFY SINGLE PRODUCT TEST');
    console.log('======================================');
    console.log('');

    const tarsus = new TarsusClient();
    const shopify = new ShopifyClient();

    // --------------------------------------------------
    // 0. Connect to Shopify
    // --------------------------------------------------

    console.log('Connecting to Shopify...');

    const connection = await shopify.testConnection();

    console.log(`Shop:      ${connection.shop?.name}`);
    console.log(
        `Location:  ${connection.location?.name || '(none found)'} ` +
        `(${shopify.locationId})`
    );
    console.log('');

    // --------------------------------------------------
    // 1. Load Tarsus products
    // --------------------------------------------------

    console.log('Loading Tarsus XML...');

    const products = tarsus.loadProducts();

    console.log(`Tarsus products loaded: ${products.length}`);

    if (!products.length) {
        throw new Error('No Tarsus products were loaded.');
    }

    // Change the index to test a different product.
    const product = products[0];

    console.log('');
    console.log('TARSUS PRODUCT');
    console.log('--------------------------------------');
    console.log(`SKU:       ${product.sku}`);
    console.log(`Title:     ${product.title}`);
    console.log(`Price:     R${Number(product.price).toFixed(2)}`);
    console.log(`Quantity:  ${product.quantity}`);
    console.log(`Brand:     ${product.brand || 'none'}`);
    console.log(`Category:  ${product.category || 'none'}`);
    console.log(`Image:     ${product.image || '(none)'}`);
    console.log('');

    // --------------------------------------------------
    // 2. Find SKU in Shopify
    // --------------------------------------------------

    console.log('Checking Shopify for this SKU...');

    const result = await shopify.findUniqueProductBySku(product.sku);

    console.log('');

    if (result.duplicate) {
        console.log('DUPLICATE SKU FOUND');
        console.log('--------------------------------------');
        console.log(`SKU: ${product.sku}`);
        console.log(
            `Found ${result.matches.length} Shopify variants with this SKU.`
        );
        console.log('');
        console.log('No product will be created or updated.');
        console.log('Clean up the duplicate SKU first.');
        return;
    }

    let productId;
    let variantId;

    // --------------------------------------------------
    // 3. Existing product -> update
    // --------------------------------------------------

    if (result.product) {
        console.log('EXISTING SHOPIFY PRODUCT FOUND');
        console.log('--------------------------------------');
        console.log(`Product ID: ${result.product.id}`);
        console.log(`Variant ID: ${result.variant.id}`);
        console.log('');

        productId = result.product.id;
        variantId = result.variant.id;

        console.log('Updating SKU, price, tracking and vendor...');

        await shopify.updateExistingProduct({
            variantId,
            sku: product.sku,
            price: product.price,
            product
        });
    } else {
        // --------------------------------------------------
        // 4. Product does not exist -> create
        // --------------------------------------------------

        console.log('SKU NOT FOUND IN SHOPIFY');
        console.log('--------------------------------------');
        console.log('Creating new Shopify product...');
        console.log('');

        const created = await shopify.createProduct({
            title: product.title,
            description: product.description,
            product
        });

        productId = created.product.id;
        variantId = created.variant.id;

        console.log(`Created Product ID: ${productId}`);
        console.log(`Created Variant ID: ${variantId}`);

        // Set SKU, price, tracking and vendor on the new variant/product.
        console.log('');
        console.log('Setting SKU, price, tracking and vendor...');

        await shopify.updateExistingProduct({
            variantId,
            sku: product.sku,
            price: product.price,
            product
        });
    }

    // --------------------------------------------------
    // 5. Inventory
    // --------------------------------------------------

    console.log('');
    console.log('Updating inventory...');

    await shopify.syncInventory({
        variantId,
        quantity: product.quantity
    });

    console.log('Inventory updated.');

    // --------------------------------------------------
    // 6. Image
    // --------------------------------------------------

    if (product.image) {
        console.log('');
        console.log('Checking product image...');

        const mediaCount = await shopify.getProductMediaCount(productId);

        if (mediaCount > 0) {
            console.log(
                `Product already has ${mediaCount} media item(s). Skipping image.`
            );
        } else {
            console.log('Adding product image...');

            await shopify.addImage({
                productId,
                imageUrl: product.image,
                altText: product.title
            });

            console.log('Image added.');
        }
    }

    // --------------------------------------------------
    // 7. Verification
    // --------------------------------------------------

    console.log('');
    console.log('VERIFYING SHOPIFY PRODUCT');
    console.log('--------------------------------------');

    const verification = await shopify.getVariantVerification(variantId);

    printVerification(shopify, verification);

    console.log('');
    console.log('======================================');
    console.log(' SINGLE PRODUCT TEST SUCCESSFUL');
    console.log('======================================');
}

main().catch(error => {
    console.error('');
    console.error('SYNC TEST FAILED');
    console.error('--------------------------------------');
    console.error(error.message);

    if (error.response?.data) {
        console.error('');
        console.error(JSON.stringify(error.response.data, null, 2));
    }

    process.exit(1);
});