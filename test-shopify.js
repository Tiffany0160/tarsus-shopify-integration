'use strict';

require('dotenv').config();

const { ShopifyClient } = require('./shopify/client');

async function main() {
    console.log('');
    console.log('======================================');
    console.log(' SHOPIFY CONNECTION TEST');
    console.log('======================================');
    console.log('');

    const shopify = new ShopifyClient();

    console.log('Connecting to Shopify...');
    console.log('');

    const shop = await shopify.testConnection();

    console.log('');
    console.log('SHOPIFY CONNECTION SUCCESSFUL');
    console.log('--------------------------------------');
    console.log('Shop:', shop.name || 'N/A');
    console.log('Domain:', shop.myshopifyDomain || 'N/A');
    console.log('Shop ID:', shop.id || 'N/A');

    console.log('');
    console.log('Checking Shopify location...');

    const locationId = shopify.locationId;

    const locationQuery = `
        query GetLocation($id: ID!) {
            location(id: $id) {
                id
                name
                isActive
            }
        }
    `;

    const result = await shopify.graphql(locationQuery, {
        id: locationId
    });

    const location = result.location;

    if (!location) {
        throw new Error(
            `Shopify location was not found: ${locationId}`
        );
    }

    console.log('');
    console.log('LOCATION SUCCESSFUL');
    console.log('--------------------------------------');
    console.log('Location:', location.name);
    console.log('Location ID:', location.id);
    console.log('Active:', location.isActive);

    console.log('');
    console.log('======================================');
    console.log(' SHOPIFY CONNECTION TEST PASSED');
    console.log('======================================');
    console.log('');
}

main().catch(error => {
    console.error('');
    console.error('SHOPIFY CONNECTION TEST FAILED');
    console.error('--------------------------------------');
    console.error(error.message);
    console.error('');

    process.exit(1);
});