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

const STATE_FILE =
    path.join(
        __dirname,
        '..',
        'data',
        'tarsus-sync-state.json'
    );

const LOG_FILE =
    path.join(
        __dirname,
        '..',
        'data',
        'tarsus-sync-log.jsonl'
    );


// ============================================================
// LOAD STATE
// ============================================================

function loadState() {
    if (!fs.existsSync(STATE_FILE)) {
        return {
            completed: {},
            failed: {},
            duplicates: {},
            startedAt: new Date().toISOString(),
            lastUpdated: null
        };
    }

    try {
        const raw =
            fs.readFileSync(
                STATE_FILE,
                'utf8'
            );

        return JSON.parse(raw);
    } catch (error) {
        console.log(
            'WARNING: Could not read sync state.'
        );

        console.log(
            'Starting with a new state file.'
        );

        return {
            completed: {},
            failed: {},
            duplicates: {},
            startedAt: new Date().toISOString(),
            lastUpdated: null
        };
    }
}


// ============================================================
// SAVE STATE
// ============================================================

function saveState(state) {
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


// ============================================================
// LOG
// ============================================================

function writeLog(entry) {
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


// ============================================================
// WAIT
// ============================================================

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('');
    console.log(
        '=============================================='
    );

    console.log(
        ' TARSUS → SHOPIFY FULL PRODUCT SYNC'
    );

    console.log(
        '=============================================='
    );

    console.log('');

    // --------------------------------------------------------
    // CLIENTS
    // --------------------------------------------------------

    const tarsus =
        new TarsusClient();

    const shopify =
        new ShopifyClient();

    // --------------------------------------------------------
    // LOAD STATE
    // --------------------------------------------------------

    const state =
        loadState();

    // --------------------------------------------------------
    // LOAD TARSUS
    // --------------------------------------------------------

    console.log(
        'Loading Tarsus products...'
    );

    const products =
        tarsus.loadProducts();

    console.log('');

    console.log(
        `Tarsus products found: ${products.length}`
    );

    console.log('');

    if (!products.length) {
        throw new Error(
            'No Tarsus products were found.'
        );
    }

    // --------------------------------------------------------
    // COUNTERS
    // --------------------------------------------------------

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let duplicates = 0;
    let failed = 0;
    let resumed = 0;

    const total =
        products.length;

    // --------------------------------------------------------
    // START
    // --------------------------------------------------------

    console.log(
        'Starting sync...'
    );

    console.log('');

    console.log(
        `Total products: ${total}`
    );

    console.log('');

    // ========================================================
    // LOOP THROUGH PRODUCTS
    // ========================================================

    for (
        let index = 0;
        index < products.length;
        index++
    ) {
        const product =
            products[index];

        const sku =
            String(
                product.sku || ''
            ).trim();

        const number =
            index + 1;

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

        // ----------------------------------------------------
        // NO SKU
        // ----------------------------------------------------

        if (!sku) {
            console.log(
                'SKIPPED: Product has no SKU.'
            );

            skipped++;

            writeLog({
                status: 'skipped',
                reason: 'missing-sku',
                index: number,
                title: product.title
            });

            continue;
        }

        // ----------------------------------------------------
        // RESUME
        // ----------------------------------------------------

        if (state.completed[sku]) {
            console.log(
                'ALREADY COMPLETED - SKIPPING'
            );

            resumed++;

            continue;
        }

        // ----------------------------------------------------
        // CHECK SHOPIFY
        // ----------------------------------------------------

        try {
            console.log(
                'Checking Shopify SKU...'
            );

            const result =
                await shopify.findUniqueProductBySku(
                    sku
                );

            // =================================================
            // DUPLICATE SKU
            // =================================================

            if (result.duplicate) {
                console.log('');
                console.log(
                    'DUPLICATE SKU'
                );

                console.log(
                    `SKU ${sku} already exists more than once in Shopify.`
                );

                console.log(
                    'No new product will be created.'
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
                                    match.product.id,

                                variantId:
                                    match.id,

                                title:
                                    match.product.title
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

                duplicates++;

                continue;
            }

            // =================================================
            // EXISTING PRODUCT
            // =================================================

            if (result.product) {
                console.log('');
                console.log(
                    'EXISTING PRODUCT FOUND'
                );

                console.log(
                    `Product ID: ${result.product.id}`
                );

                console.log(
                    `Variant ID: ${result.variant.id}`
                );

                // ---------------------------------------------
                // UPDATE SKU + PRICE
                // ---------------------------------------------

                console.log(
                    'Updating SKU and price...'
                );

                await shopify.updateExistingProduct({
                    productId:
                        result.product.id,

                    variantId:
                        result.variant.id,

                    sku,

                    price:
                        product.price
                });

                // ---------------------------------------------
                // INVENTORY
                // ---------------------------------------------

                console.log(
                    'Updating inventory...'
                );

                await shopify.syncInventory({
                    variantId:
                        result.variant.id,

                    quantity:
                        product.quantity
                });

                // ---------------------------------------------
                // IMAGE
                // ---------------------------------------------

                if (product.image) {
                    console.log(
                        'Adding image...'
                    );

                    await shopify.addImage({
                        productId:
                            result.product.id,

                        imageUrl:
                            product.image,

                        altText:
                            product.title
                    });
                } else {
                    console.log(
                        'No image supplied by Tarsus.'
                    );
                }

                // ---------------------------------------------
                // MARK COMPLETE
                // ---------------------------------------------

                state.completed[sku] = {
                    status: 'updated',

                    productId:
                        result.product.id,

                    variantId:
                        result.variant.id,

                    price:
                        Number(
                            product.price
                        ).toFixed(2),

                    quantity:
                        Number(
                            product.quantity
                        ),

                    completedAt:
                        new Date().toISOString()
                };

                delete state.failed[sku];

                saveState(state);

                writeLog({
                    status: 'updated',

                    sku,

                    title:
                        product.title,

                    productId:
                        result.product.id,

                    variantId:
                        result.variant.id,

                    price:
                        Number(
                            product.price
                        ).toFixed(2),

                    quantity:
                        Number(
                            product.quantity
                        )
                });

                updated++;

                console.log('');
                console.log(
                    'PRODUCT UPDATED SUCCESSFULLY'
                );

                // Small pause
                await sleep(300);

                continue;
            }

            // =================================================
            // PRODUCT DOES NOT EXIST
            // =================================================

            console.log('');
            console.log(
                'SKU NOT FOUND'
            );

            console.log(
                'Creating Shopify product...'
            );

            // ---------------------------------------------
            // CREATE PRODUCT
            // ---------------------------------------------

            const createdProduct =
                await shopify.createProduct({
                    title:
                        product.title,

                    description:
                        product.description
                });

            const createdProductId =
                createdProduct.product.id;

            const createdVariantId =
                createdProduct.variant.id;

            console.log(
                `Created Product: ${createdProductId}`
            );

            console.log(
                `Created Variant: ${createdVariantId}`
            );

            // ---------------------------------------------
            // SET SKU + PRICE
            // ---------------------------------------------

            console.log(
                'Setting SKU and price...'
            );

            await shopify.updateVariant({
                variantId:
                    createdVariantId,

                sku,

                price:
                    product.price
            });

            // ---------------------------------------------
            // INVENTORY
            // ---------------------------------------------

            console.log(
                'Setting inventory...'
            );

            await shopify.syncInventory({
                variantId:
                    createdVariantId,

                quantity:
                    product.quantity
            });

            // ---------------------------------------------
            // IMAGE
            // ---------------------------------------------

            if (product.image) {
                console.log(
                    'Adding image...'
                );

                await shopify.addImage({
                    productId:
                        createdProductId,

                    imageUrl:
                        product.image,

                    altText:
                        product.title
                });
            } else {
                console.log(
                    'No image supplied by Tarsus.'
                );
            }

            // ---------------------------------------------
            // MARK COMPLETE
            // ---------------------------------------------

            state.completed[sku] = {
                status: 'created',

                productId:
                    createdProductId,

                variantId:
                    createdVariantId,

                price:
                    Number(
                        product.price
                    ).toFixed(2),

                quantity:
                    Number(
                        product.quantity
                    ),

                completedAt:
                    new Date().toISOString()
            };

            delete state.failed[sku];

            saveState(state);

            writeLog({
                status: 'created',

                sku,

                title:
                    product.title,

                productId:
                    createdProductId,

                variantId:
                    createdVariantId,

                price:
                    Number(
                        product.price
                    ).toFixed(2),

                quantity:
                    Number(
                        product.quantity
                    )
            });

            created++;

            console.log('');
            console.log(
                'PRODUCT CREATED SUCCESSFULLY'
            );

            // Small pause
            await sleep(500);
        } catch (error) {
            // =================================================
            // ERROR
            // =================================================

            failed++;

            console.log('');
            console.log(
                'PRODUCT FAILED'
            );

            console.log(
                `SKU: ${sku}`
            );

            console.log(
                `Error: ${error.message}`
            );

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

            console.log(
                'Continuing with the next product...'
            );

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
        ' TARSUS → SHOPIFY SYNC FINISHED'
    );

    console.log(
        '=============================================='
    );

    console.log('');

    console.log(
        `Total Tarsus products: ${total}`
    );

    console.log(
        `Created:                 ${created}`
    );

    console.log(
        `Updated:                 ${updated}`
    );

    console.log(
        `Already completed:       ${resumed}`
    );

    console.log(
        `Duplicates skipped:      ${duplicates}`
    );

    console.log(
        `Skipped:                 ${skipped}`
    );

    console.log(
        `Failed:                  ${failed}`
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
            'They are saved in the state file and can be retried.'
        );
    } else {
        console.log(
            'ALL PROCESSED PRODUCTS COMPLETED SUCCESSFULLY.'
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
        ' FULL SYNC FAILED'
    );

    console.error(
        '=============================================='
    );

    console.error('');

    console.error(
        error.message
    );

    process.exit(1);
});