import products from '../release/products.json';
export const OFFLINE = import.meta.env?.MODE === 'offline';
export const PRODUCT = products[OFFLINE ? 'offline' : 'cloud'];
