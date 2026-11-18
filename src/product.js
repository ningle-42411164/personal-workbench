import products from '../release/products.json';
import publicProduct from '../release/public.json';
export const OFFLINE = import.meta.env?.MODE === 'offline';
export const PUBLIC = import.meta.env?.MODE === 'public';
export const PRODUCT = PUBLIC ? publicProduct : products[OFFLINE ? 'offline' : 'cloud'];
