'use strict';

require('dotenv').config();

const { TarsusClient } = require('./tarsus/client');

try {
    const tarsus = new TarsusClient();

    const products = tarsus.loadProducts();

    console.log('');
    console.log('======================================');
    console.log(' TARSUS XML TEST');
    console.log('======================================');
    console.log(`Products loaded: ${products.length}`);
    console.log('');

    if (products.length === 0) {
        throw new Error('No products were loaded.');
    }

    console.log('FIRST PRODUCT');
    console.log('-------------');

    console.log('SKU:', products[0].sku);
    console.log('Title:', products[0].title);
    console.log('Brand:', products[0].brand);
    console.log('Category:', products[0].category);
    console.log('Tarsus Price:', products[0].tarsusPrice);
    console.log('Shopify Price:', products[0].price);
    console.log('Stock Code:', products[0].stockCode);
    console.log('Shopify Quantity:', products[0].quantity);
    console.log('Image:', products[0].image);

    console.log('');
    console.log('======================================');
    console.log(' TEST COMPLETE');
    console.log('======================================');
} catch (error) {
    console.error('');
    console.error('TARSUS TEST FAILED');
    console.error('-------------------');
    console.error(error.message);
    process.exit(1);
}