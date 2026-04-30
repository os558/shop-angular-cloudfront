import { Config } from './config.interface';

export const environment: Config = {
  production: true,
  apiEndpoints: {
    product: 'https://api.shop-angular-cloudfront.tech',
    order: 'https://api.shop-angular-cloudfront.tech',
    import: 'https://api.shop-angular-cloudfront.tech',
    bff: 'https://api.shop-angular-cloudfront.tech',
    cart: 'https://api.shop-angular-cloudfront.tech',
  },
  apiEndpointsEnabled: {
    product: true,
    order: false,
    import: true,
    bff: true,
    cart: false,
  },
};
