import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { ApiService } from './api-service';
import { ProductService } from './product-service';
import { ImportService } from './import-service';

export class APIStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const apiService = new ApiService(this, 'api');

    const productService = new ProductService(this, 'product-api', { sharedApi: apiService.sharedApi });

    new ImportService(this, 'import', {
      sharedApi: apiService.sharedApi,
      tables: productService.tables,
    });
  }
}
