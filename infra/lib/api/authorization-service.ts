import { aws_apigateway, aws_lambda } from "aws-cdk-lib";
import { Construct } from "constructs";
import { LambdaDefaultConfig } from "../shared/config";

const path = './../api/dist';

export class AuthorizationService extends Construct {
    public readonly lambdaBasicAuthorizer: aws_apigateway.IAuthorizer;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const authorizer = this.createLambda();

        this.lambdaBasicAuthorizer = new aws_apigateway.TokenAuthorizer(this, 'BasicAuthorizer', {
            handler: authorizer,
        });
    }

    private createLambda(): aws_lambda.Function {
        const lambdaBasicAuthorizer = new aws_lambda.Function(this, 'basic-authorizer-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/basicAuthorizer`),
            ...LambdaDefaultConfig,
            environment: {
                BASIC_USER: process.env.BASIC_USER || '',
                BASIC_PASSWORD: process.env.BASIC_PASSWORD || ''
            }
        });

        return lambdaBasicAuthorizer;
    }
}
