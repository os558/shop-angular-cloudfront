import {
    aws_apigateway,
    aws_dynamodb,
    aws_lambda,
    aws_route53,
    aws_route53_targets,
    aws_s3,
    aws_s3_notifications,
    CfnOutput,
    RemovalPolicy,
    Aspects,
    IAspect,
    StackProps,
} from "aws-cdk-lib";
import { Construct, IConstruct } from "constructs";
import { API_DOMAIN_NAME, DOMAIN_NAME, LambdaDefaultConfig } from "../shared/config";
import { createDomainResources } from "../shared/domain";

const path = './../api/dist';

export interface ImportServiceProps {
    sharedApi: aws_apigateway.RestApi;
}

interface Lambdas {
    lambdaImportProductsFile: aws_lambda.Function;
    lambdaImportFileParser: aws_lambda.Function;
}

interface Buckets {
    importBucket: aws_s3.Bucket;
}

export class ImportService extends Construct {
    constructor(scope: Construct, id: string, props: ImportServiceProps) {
        super(scope, id);

        const buckets = this.createBuckets();

        const lambdas = this.createLambda(buckets);

        this.addEvents(buckets, lambdas);
        this.addRoutes(props.sharedApi, lambdas);
        this.addOutputs(props.sharedApi);
    }

    private createApi() {
        // Check if local context is set
        // in this case we don't need to create domain resources
        // and we can use localstack url
        const isLocal = this.node.tryGetContext('local') === 'true';

        let domainProps = {};
        let hostedZone: aws_route53.IHostedZone | null = null;

        if (!isLocal) {
            // Create domain resources
            const domainResources = createDomainResources(this, {
                domainName: API_DOMAIN_NAME,
            });

            hostedZone = domainResources.hostedZone;
            domainProps = {
                domainName: {
                    domainName: API_DOMAIN_NAME,
                    certificate: domainResources.certificate,
                },
            };
        }

        // Create API Gateway
        const api = new aws_apigateway.RestApi(this, "import-api", {
            restApiName: "Import API Gateway",
            description: "This API serves the Lambda functions.",

            // Custom domain name
            ...domainProps,

            // CORS configuration
            defaultCorsPreflightOptions: {
                allowOrigins: ['http://localhost:4200', `https://${DOMAIN_NAME}`],
                allowMethods: aws_apigateway.Cors.ALL_METHODS,
                allowHeaders: aws_apigateway.Cors.DEFAULT_HEADERS,
            },
        });

        if (!isLocal && hostedZone) {
            // DNS A record for api subdomain -> API Gateway
            new aws_route53.ARecord(this, 'ApiAliasRecord', {
                zone: hostedZone,
                recordName: 'api',
                target: aws_route53.RecordTarget.fromAlias(
                    new aws_route53_targets.ApiGateway(api),
                ),
            });
        }

        return api;
    }

    private createBuckets(): Buckets {
        // Check if local context is set
        // in case of local we don't need to delete bucket and its contents
        const isLocal = this.node.tryGetContext('local') === 'true';

        // S3 bucket for imports
        const importBucket = new aws_s3.Bucket(this, "ImportBucket",
            isLocal ? {
            } : {
                // Remove bucket and all contents when stack is deleted
                removalPolicy: RemovalPolicy.DESTROY,

                // Automatically delete all objects in the bucket when the stack is deleted
                autoDeleteObjects: true,
            });

        return { importBucket };
    }

    private createLambda(buckets: Buckets): Lambdas {
        const { importBucket } = buckets;
        // Lambda default configuration
        const defaultLambdaConfig = {
            ...LambdaDefaultConfig,
            environment: {
                BUCKET_NAME: importBucket.bucketName,
            }
        }

        // Import products file Lambda function
        const lambdaImportProductsFile = new aws_lambda.Function(this, 'import-products-file-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/importProductsFile`),
            ...defaultLambdaConfig
        });

        importBucket.grantPut(lambdaImportProductsFile);


        // Import file parser Lambda function
        const lambdaImportFileParser = new aws_lambda.Function(this, 'import-file-parser-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/importFileParser`),
            ...defaultLambdaConfig
        });

        // Grant read permissions to Lambda functions
        importBucket.grantRead(lambdaImportFileParser);

        return {
            lambdaImportProductsFile: lambdaImportProductsFile,
            lambdaImportFileParser: lambdaImportFileParser,
        };
    }

    private addEvents(buckets: Buckets, lambdas: Lambdas) {
        const { importBucket } = buckets;
        const { lambdaImportFileParser } = lambdas;

        importBucket.addEventNotification(
            aws_s3.EventType.OBJECT_CREATED,
            new aws_s3_notifications.LambdaDestination(lambdaImportFileParser),
            {
                prefix: 'uploaded/',
                suffix: '.csv'
            }
        );
    }

    private addRoutes(api: aws_apigateway.RestApi, lambdas: Lambdas) {
        // Lambda integrations
        const importProductsFileIntegration = new aws_apigateway.LambdaIntegration(lambdas.lambdaImportProductsFile);

        // Products resource
        const productsResource = api.root.addResource("import");
        productsResource.addMethod('GET', importProductsFileIntegration);
    }

    private addOutputs(api: aws_apigateway.RestApi) {
        new CfnOutput(this, 'ImportApiEndpoint', {
            value: api.url,
        });

        new CfnOutput(this, 'ImportApiCustomDomain', {
            value: `https://${API_DOMAIN_NAME}`,
            description: 'The custom API domain URL',
        });
    }

}
