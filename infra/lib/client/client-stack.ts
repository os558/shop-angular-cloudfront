import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { ClientService } from './client-service';

export class ClientStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new ClientService(this, 'client-service');
  }
}
