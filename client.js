'use strict';

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

class TarsusClient {
    constructor() {
        this.xmlFile = path.resolve(
            process.env.TARSUS_XML_FILE || './data/tarsus-products.xml'
        );

        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            trimValues: true
        });
    }

    loadProducts() {
        if (!fs.existsSync(this.xmlFile)) {
            throw new Error(`Tarsus XML file not found: ${this.xmlFile}`);
        }

        console.log(`Reading Tarsus XML: ${this.xmlFile}`);

        const xml = fs.readFileSync(this.xmlFile, 'utf8');

        if (!xml.trim()) {
            throw new Error('Tarsus XML file is empty.');
        }

        const parsed = this.parser.parse(xml);

        const rawProducts = this.findProductArray(parsed);

        if (!rawProducts.length) {
            throw new Error(
                'No Tarsus products were found in the XML file.'
            );
        }

        console.log(`Raw Tarsus records found: ${rawProducts.length}`);

        const products = [];

        for (const raw of rawProducts) {
            const product = this.normaliseProduct(raw);

            if (!product.sku) {
                continue;
            }

            products.push(product);
        }

        console.log(`Products with SKU: ${products.length}`);

        return products;
    }

    findProductArray(parsed) {
        const possiblePaths = [
            parsed?.products?.product,
            parsed?.Products?.Product,
            parsed?.productFeed?.products?.product,
            parsed?.ProductFeed?.Products?.Product,
            parsed?.feed?.products?.product,
            parsed?.Feed?.Products?.Product
        ];

        for (const value of possiblePaths) {
            if (Array.isArray(value)) {
                return value;
            }

            if (value && typeof value === 'object') {
                return [value];
            }
        }

        return this.searchForProductArray(parsed);
    }

    searchForProductArray(value) {
        if (!value || typeof value !== 'object') {
            return [];
        }

        if (Array.isArray(value)) {
            if (
                value.length > 0 &&
                value.some(
                    item =>
                        item &&
                        typeof item === 'object' &&
                        this.hasSkuField(item)
                )
            ) {
                return value;
            }

            for (const item of value) {
                const result = this.searchForProductArray(item);

                if (result.length) {
                    return result;
                }
            }

            return [];
        }

        for (const [key, child] of Object.entries(value)) {
            const lowerKey = key.toLowerCase();

            if (
                lowerKey === 'product' ||
                lowerKey === 'products' ||
                lowerKey === 'item'
            ) {
                const result = this.searchForProductArray(child);

                if (result.length) {
                    return result;
                }
            }
        }

        for (const child of Object.values(value)) {
            const result = this.searchForProductArray(child);

            if (result.length) {
                return result;
            }
        }

        return [];
    }

    hasSkuField(obj) {
        const keys = Object.keys(obj).map(k => k.toLowerCase());

        return keys.some(key =>
            [
                'sku',
                'productsku',
                'partnumber',
                'productcode',
                'code',
                'itemcode'
            ].includes(key)
        );
    }

    getValue(obj, names) {
        if (!obj || typeof obj !== 'object') {
            return '';
        }

        const entries = Object.entries(obj);

        for (const wanted of names) {
            const wantedLower = wanted.toLowerCase();

            for (const [key, value] of entries) {
                if (key.toLowerCase() === wantedLower) {
                    if (value === null || value === undefined) {
                        return '';
                    }

                    if (typeof value === 'object') {
                        if ('#text' in value) {
                            return String(value['#text']).trim();
                        }

                        return '';
                    }

                    return String(value).trim();
                }
            }
        }

        return '';
    }

    normaliseProduct(raw) {
        const sku = this.getValue(raw, [
            'sku',
            'productsku',
            'partnumber',
            'productcode',
            'code',
            'itemcode'
        ]);

        const title = this.getValue(raw, [
            'title',
            'name',
            'productname',
            'description'
        ]);

        const description = this.getValue(raw, [
            'description',
            'longdescription',
            'productdescription'
        ]);

        const brand = this.getValue(raw, [
            'brand',
            'manufacturer',
            'make'
        ]);

        const category = this.getValue(raw, [
            'category',
            'categoryname',
            'productcategory'
        ]);

        const priceRaw = this.getValue(raw, [
            'price',
            'sellingprice',
            'dealerprice',
            'cost',
            'rrp'
        ]);

        const stockCode = this.getValue(raw, [
            'stock',
            'stocklevel',
            'availability',
            'stockstatus',
            'quantity'
        ]);

        const image = this.getValue(raw, [
            'image',
            'imageurl',
            'productimage',
            'defaultimage',
            'picture'
        ]);

        const price = this.calculateShopifyPrice(priceRaw);
        const quantity = this.stockToQuantity(stockCode);

        return {
            sku: sku.trim(),
            title: (title || sku).trim(),
            description: (description || title || sku).trim(),
            brand: brand.trim(),
            category: category.trim(),
            tarsusPrice: this.cleanNumber(priceRaw),
            price,
            stockCode: stockCode.trim(),
            quantity,
            image: image.trim(),
            raw
        };
    }

    cleanNumber(value) {
        if (value === null || value === undefined) {
            return 0;
        }

        const cleaned = String(value)
            .replace(/R/gi, '')
            .replace(/,/g, '')
            .trim();

        const number = Number(cleaned);

        return Number.isFinite(number) ? number : 0;
    }

    calculateShopifyPrice(tarsusPrice) {
        const basePrice = this.cleanNumber(tarsusPrice);

        if (basePrice <= 0) {
            return 0;
        }

        // Add 15%.
        const withMarkup = basePrice * 1.145;

        // Round UP to the next R10.
        const rounded = Math.ceil(withMarkup / 10) * 10;

        return Number(rounded.toFixed(2));
    }

    stockToQuantity(stock) {
        const value = String(stock || '')
            .trim()
            .toUpperCase();

        if (value === 'A') {
            return 0;
        }

        if (value === 'B') {
            return 10;
        }

        if (value === 'C') {
            return 20;
        }

        const numeric = Number(value);

        if (Number.isFinite(numeric) && numeric >= 0) {
            return Math.floor(numeric);
        }

        return 0;
    }
}

module.exports = {
    TarsusClient
};