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
  cognito: {
    enabled: true,
    loginUrl: 'https://shop-angular-cloudfront.auth.us-east-1.amazoncognito.com/login?client_id=27inoro6kgi2bolt4vo13tiqdu&response_type=token&scope=email+openid+profile&redirect_uri=https://shop-angular-cloudfront.tech'
  }
};
