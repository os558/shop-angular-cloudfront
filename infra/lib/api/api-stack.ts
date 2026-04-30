import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { ApiService } from './api-service';
import { ProductService } from './product-service';
import { ImportService } from './import-service';
import { AuthorizationService } from './authorization-service';

export class APIStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const apiService = new ApiService(this, 'api');

    const authService = new AuthorizationService(this, 'authorization-api');

    const productService = new ProductService(this, 'product-api', {
      sharedApi: apiService.sharedApi,
      basicAuthorizer: authService.lambdaBasicAuthorizer,
    });

    new ImportService(this, 'import', {
      sharedApi: apiService.sharedApi,
      tables: productService.tables,
      basicAuthorizer: authService.lambdaBasicAuthorizer,
    });
  }
}
