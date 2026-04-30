// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Config } from './config.interface';

const API_URL = 'https://y7k6etbh5d.execute-api.us-east-1.amazonaws.com/prod';

export const environment: Config = {
  production: false,
  apiEndpoints: {
    product: API_URL,
    order: API_URL,
    import: API_URL,
    bff: API_URL,
    cart: API_URL,
  },
  apiEndpointsEnabled: {
    product: true,
    order: false,
    import: true,
    bff: true,
    cart: false,
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
