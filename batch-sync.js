'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { TarsusClient } =
    require('./tarsus/client');

const { ShopifyClient } =
    require('./shopify/client');


// ============================================================
// SETTINGS
// ============================================================

const BATCH_SIZE = 500;

const STATE_FILE =
    path.join(
        __dirname,
        '..',
        'data',
        'tarsus-batch-state.json'
    );

const LOG_FILE =
    path.join(
        __dirname,
        '..',
        'data',
        'tarsus-batch-log.jsonl'
    );


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function ensureDataFolder() {
    const dataFolder =
        path.join(
            __dirname,
            '..',
            'data'
        );

    if (!fs.existsSync(dataFolder)) {
        fs.mkdirSync(
            dataFolder,
            { recursive: true }
        );
    }
}


function createEmptyState() {
    return {
        completed: {},
        failed: {},
        duplicates: {},
        startedAt: new Date().toISOString(),
        lastUpdated: null
    };
}


function loadState() {
    ensureDataFolder();

    if (!fs.existsSync(STATE_FILE)) {
        return createEmptyState();
    }

    try {
        const raw =
            fs.readFileSync(
                STATE_FILE,
                'utf8'
            );

        const state =
            JSON.parse(raw);

        if (!state.completed) {
            state.completed = {};
        }

        if (!state.failed) {
            state.failed = {};
        }

        if (!state.duplicates) {
            state.duplicates = {};
        }

        return state;

    } catch (error) {
        console.log('');
        console.log(
            'WARNING: Could not read batch state file.'
        );

        console.log(
            'A new batch state will be created.'
        );

        return createEmptyState();
    }
}


function saveState(state) {
    ensureDataFolder();

    state.lastUpdated =
        new Date().toISOString();

    fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(
            state,
            null,
            2
        ),
        'utf8'
    );
}


function writeLog(entry) {
    ensureDataFolder();

    fs.appendFileSync(
        LOG_FILE,
        JSON.stringify({
            timestamp:
                new Date().toISOString(),

            ...entry
        }) + '\n',
        'utf8'
    );
}


function getBatchNumber() {
    const argument =
        process.argv[2];

    if (!argument) {
        throw new Error(
            'Please provide a batch number. Example: node .\\src\\batch-sync.js 1'
        );
    }

    const batchNumber =
        Number(argument);

    if (
        !Number.isInteger(batchNumber) ||
        batchNumber < 1
    ) {
        throw new Error(
            'Batch number must be a positive whole number. Example: 1'
        );
    }

    return batchNumber;
}


function getBatchRange(
    batchNumber,
    total
) {
    const start =
        (batchNumber - 1) *
        BATCH_SIZE;

    const end =
        Math.min(
            start + BATCH_SIZE,
            total
        );

    return {
        start,
        end
    };
}


// ============================================================
// PROCESS ONE PRODUCT
// ============================================================

async function processProduct(
    product,
    number,
    total,
    shopify,
    state
) {
    const sku =
        String(
            product.sku || ''
        ).trim();

    console.log('');
    console.log(
        '----------------------------------------------'
    );

    console.log(
        `[${number}/${total}] ${sku}`
    );

    console.log(
        product.title
    );

    console.log(
        '----------------------------------------------'
    );

    // --------------------------------------------------------
    // Missing SKU
    // --------------------------------------------------------

    if (!sku) {
        console.log(
            'SKIPPED: Product has no SKU.'
        );

        writeLog({
            status: 'skipped',
            reason: 'missing-sku',
            index: number,
            title:
                product.title
        });

        return {
            status: 'skipped'
        };
    }


    // --------------------------------------------------------
    // Already completed
    // --------------------------------------------------------

    if (state.completed[sku]) {
        console.log(
            'ALREADY COMPLETED - SKIPPING'
        );

        return {
            status: 'already-completed'
        };
    }


    // --------------------------------------------------------
    // Product information
    // --------------------------------------------------------

    console.log(
        `SKU:      ${sku}`
    );

    console.log(
        `Price:    R${Number(product.price || 0).toFixed(2)}`
    );

    console.log(
        `Quantity: ${Number(product.quantity || 0)}`
    );

    console.log(
        `Brand:    ${product.brand || 'none'}`
    );

    console.log(
        `Category: ${product.category || 'none'}`
    );

    console.log(
        `Condition: ${product.condition || 'New'}`
    );


    // --------------------------------------------------------
    // Find product in Shopify
    // --------------------------------------------------------

    console.log('');
    console.log(
        'Checking Shopify SKU...'
    );

    const result =
        await shopify.findUniqueProductBySku(
            sku
        );


    // ========================================================
    // DUPLICATE SKU
    // ========================================================

    if (result.duplicate) {
        console.log('');
        console.log(
            'DUPLICATE SKU FOUND'
        );

        console.log(
            `SKU ${sku} exists more than once in Shopify.`
        );

        console.log(
            'No product will be created or updated.'
        );

        state.duplicates[sku] = {
            title:
                product.title,

            checkedAt:
                new Date().toISOString(),

            matches:
                result.matches.map(
                    match => ({
                        productId:
                            match.product?.id,

                        variantId:
                            match.id,

                        title:
                            match.product?.title
                    })
                )
        };

        saveState(state);

        writeLog({
            status: 'duplicate',
            sku,
            title:
                product.title
        });

        return {
            status: 'duplicate'
        };
    }


    let productId;
    let variantId;
    let action;


    // ========================================================
    // EXISTING PRODUCT
    // ========================================================

    if (result.product) {
        console.log('');
        console.log(
            'EXISTING SHOPIFY PRODUCT FOUND'
        );

        console.log(
            `Product ID: ${result.product.id}`
        );

        console.log(
            `Variant ID: ${result.variant.id}`
        );

        productId =
            result.product.id;

        variantId =
            result.variant.id;

        console.log('');
        console.log(
            'Updating SKU, price, tracking, vendor and product details...'
        );


        // IMPORTANT:
        // Pass the COMPLETE Tarsus product.
        // This is what allows the Shopify client
        // to determine the correct vendor.
        await shopify.updateExistingProduct({
            productId,
            variantId,
            sku,
            price:
                product.price,
            product
        });

        action = 'updated';

    } else {

        // ====================================================
        // NEW PRODUCT
        // ====================================================

        console.log('');
        console.log(
            'SKU NOT FOUND IN SHOPIFY'
        );

        console.log(
            'Creating new Shopify product...'
        );

        const created =
            await shopify.createProduct({
                title:
                    product.title,

                description:
                    product.description,

                product
            });

        productId =
            created.product.id;

        variantId =
            created.variant.id;

        console.log('');
        console.log(
            `Created Product ID: ${productId}`
        );

        console.log(
            `Created Variant ID: ${variantId}`
        );


        // ----------------------------------------------------
        // Set SKU, price and tracking
        // ----------------------------------------------------

        console.log('');
        console.log(
            'Setting SKU, price, tracking and vendor...'
        );

        await shopify.updateExistingProduct({
            productId,
            variantId,
            sku,
            price:
                product.price,
            product
        });

        action = 'created';
    }


    // ========================================================
    // INVENTORY
    // ========================================================

    console.log('');
    console.log(
        'Updating inventory...'
    );

    console.log(
        `Target quantity: ${Number(product.quantity || 0)}`
    );

    await shopify.syncInventory({
        variantId,
        quantity:
            Number(product.quantity || 0)
    });

    console.log(
        'Inventory updated.'
    );


    // ========================================================
    // IMAGE
    // ========================================================

    if (product.image) {

        console.log('');
        console.log(
            'Checking product image...'
        );

        const mediaCount =
            await shopify.getProductMediaCount(
                productId
            );

        if (mediaCount > 0) {

            console.log(
                `Product already has ${mediaCount} media item(s).`
            );

            console.log(
                'Skipping image to prevent duplicates.'
            );

        } else {

            console.log(
                'No existing media found.'
            );

            console.log(
                'Adding Tarsus image...'
            );

            await shopify.addImage({
                productId,
                imageUrl:
                    product.image,
                altText:
                    product.title
            });

            console.log(
                'Image added successfully.'
            );
        }

    } else {

        console.log('');
        console.log(
            'No Tarsus image supplied.'
        );
    }


    // ========================================================
    // SAVE COMPLETED PRODUCT
    // ========================================================

    state.completed[sku] = {
        status:
            action,

        productId,
        variantId,

        title:
            product.title,

        vendor:
            product.brand ||
            product.category ||
            product.vendor ||
            'Tarsus',

        price:
            Number(
                product.price || 0
            ).toFixed(2),

        quantity:
            Number(
                product.quantity || 0
            ),

        completedAt:
            new Date().toISOString()
    };

    delete state.failed[sku];

    saveState(state);


    // ========================================================
    // LOG
    // ========================================================

    writeLog({
        status:
            action,

        sku,

        title:
            product.title,

        productId,
        variantId,

        price:
            Number(
                product.price || 0
            ).toFixed(2),

        quantity:
            Number(
                product.quantity || 0
            )
    });


    console.log('');
    console.log(
        action === 'created'
            ? 'PRODUCT CREATED SUCCESSFULLY'
            : 'PRODUCT UPDATED SUCCESSFULLY'
    );


    // Small pause between products.
    await sleep(
        action === 'created'
            ? 500
            : 300
    );


    return {
        status:
            action
    };
}


// ============================================================
// MAIN
// ============================================================

async function main() {

    const batchNumber =
        getBatchNumber();


    console.log('');
    console.log(
        '=============================================='
    );

    console.log(
        ' TARSUS → SHOPIFY BATCH SYNC'
    );

    console.log(
        '=============================================='
    );

    console.log('');


    // --------------------------------------------------------
    // Settings
    // --------------------------------------------------------

    console.log(
        `Batch size: ${BATCH_SIZE}`
    );

    console.log(
        `Requested batch: ${batchNumber}`
    );

    console.log('');


    // --------------------------------------------------------
    // Clients
    // --------------------------------------------------------

    const tarsus =
        new TarsusClient();

    const shopify =
        new ShopifyClient();


    // --------------------------------------------------------
    // Shopify connection
    // --------------------------------------------------------

    console.log(
        'Connecting to Shopify...'
    );

    const connection =
        await shopify.testConnection();

    console.log('');
    console.log(
        `Shop: ${connection.shop?.name || 'Unknown'}`
    );

    console.log(
        `Location: ${
            connection.location?.name ||
            'Unknown'
        }`
    );

    console.log(
        `Location ID: ${shopify.locationId}`
    );

    console.log('');


    // --------------------------------------------------------
    // Load Tarsus
    // --------------------------------------------------------

    console.log(
        'Loading Tarsus products...'
    );

    const products =
        tarsus.loadProducts();

    console.log('');

    console.log(
        `Total Tarsus products: ${products.length}`
    );


    if (!products.length) {
        throw new Error(
            'No Tarsus products were loaded.'
        );
    }


    // --------------------------------------------------------
    // Calculate batch
    // --------------------------------------------------------

    const {
        start,
        end
    } = getBatchRange(
        batchNumber,
        products.length
    );


    if (start >= products.length) {
        const totalBatches =
            Math.ceil(
                products.length /
                BATCH_SIZE
            );

        throw new Error(
            `Batch ${batchNumber} does not exist. ` +
            `There are only ${totalBatches} batches.`
        );
    }


    const batchProducts =
        products.slice(
            start,
            end
        );


    const totalBatches =
        Math.ceil(
            products.length /
            BATCH_SIZE
        );


    console.log('');
    console.log(
        '=============================================='
    );

    console.log(
        ` BATCH ${batchNumber}/${totalBatches}`
    );

    console.log(
        '=============================================='
    );

    console.log('');

    console.log(
        `Products ${start + 1} to ${end}`
    );

    console.log(
        `Products in this batch: ${batchProducts.length}`
    );

    console.log('');


    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    const state =
        loadState();


    // --------------------------------------------------------
    // Counters
    // --------------------------------------------------------

    let created = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    let duplicates = 0;
    let alreadyCompleted = 0;


    // ========================================================
    // PROCESS BATCH
    // ========================================================

    for (
        let i = 0;
        i < batchProducts.length;
        i++
    ) {

        const product =
            batchProducts[i];

        const globalNumber =
            start + i + 1;


        try {

            const result =
                await processProduct(
                    product,
                    globalNumber,
                    products.length,
                    shopify,
                    state
                );


            if (result.status === 'created') {
                created++;
            }

            else if (result.status === 'updated') {
                updated++;
            }

            else if (result.status === 'duplicate') {
                duplicates++;
            }

            else if (result.status === 'skipped') {
                skipped++;
            }

            else if (
                result.status ===
                'already-completed'
            ) {
                alreadyCompleted++;
            }

        } catch (error) {

            failed++;

            const sku =
                String(
                    product.sku || ''
                ).trim();


            console.log('');
            console.log(
                '=============================================='
            );

            console.log(
                ' PRODUCT FAILED'
            );

            console.log(
                '=============================================='
            );

            console.log(
                `SKU: ${sku}`
            );

            console.log(
                `Title: ${product.title}`
            );

            console.log(
                `Error: ${error.message}`
            );


            // ----------------------------------------------
            // Save failure
            // ----------------------------------------------

            state.failed[sku] = {
                title:
                    product.title,

                error:
                    error.message,

                failedAt:
                    new Date().toISOString()
            };

            saveState(state);


            writeLog({
                status: 'failed',

                sku,

                title:
                    product.title,

                error:
                    error.message
            });


            console.log('');
            console.log(
                'Continuing with the next product...'
            );


            // Give Shopify a short break after an error.
            await sleep(1000);
        }
    }


    // ========================================================
    // FINAL SUMMARY
    // ========================================================

    console.log('');
    console.log('');
    console.log(
        '=============================================='
    );

    console.log(
        ` BATCH ${batchNumber} COMPLETE`
    );

    console.log(
        '=============================================='
    );

    console.log('');

    console.log(
        `Total products in Tarsus: ${products.length}`
    );

    console.log(
        `This batch:                ${batchProducts.length}`
    );

    console.log(
        `Created:                   ${created}`
    );

    console.log(
        `Updated:                   ${updated}`
    );

    console.log(
        `Already completed:         ${alreadyCompleted}`
    );

    console.log(
        `Duplicates:                ${duplicates}`
    );

    console.log(
        `Skipped:                   ${skipped}`
    );

    console.log(
        `Failed:                    ${failed}`
    );

    console.log('');

    console.log(
        `State file: ${STATE_FILE}`
    );

    console.log(
        `Log file:   ${LOG_FILE}`
    );

    console.log('');


    if (failed > 0) {

        console.log(
            'WARNING: Some products failed.'
        );

        console.log(
            'They have been saved in the state file.'
        );

        console.log(
            'They can be retried later.'
        );

    } else {

        console.log(
            'BATCH COMPLETED WITHOUT ERRORS.'
        );
    }


    console.log('');
}


// ============================================================
// RUN
// ============================================================

main().catch(error => {

    console.error('');
    console.error(
        '=============================================='
    );

    console.error(
        ' BATCH SYNC FAILED'
    );

    console.error(
        '=============================================='
    );

    console.error('');

    console.error(
        error.message
    );

    if (error.response?.data) {

        console.error('');

        console.error(
            JSON.stringify(
                error.response.data,
                null,
                2
            )
        );
    }

    process.exit(1);
});