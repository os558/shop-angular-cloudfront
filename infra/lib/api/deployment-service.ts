import {
    aws_apigateway,
    aws_dynamodb,
    aws_lambda,
    aws_route53,
    aws_route53_targets,
    CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { API_DOMAIN_NAME, DOMAIN_NAME, LambdaDefaultConfig } from "../shared/config";
import { createDomainResources } from "../shared/domain";

const path = './../api/dist';

interface Lambdas {
    getProductsList: aws_lambda.Function;
    getProductsById: aws_lambda.Function;
    createProduct: aws_lambda.Function;
}

interface Tables {
    productsTable: aws_dynamodb.Table;
    stocksTable: aws_dynamodb.Table;
}

export class DeploymentService extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Create API Gateway
        const api = this.createApi()

        // Creat    e tables
        const tables = this.createTables();

        // Create Lambda functions
        const lambdas = this.createLambda(tables);

        this.addRoutes(api, lambdas);
        this.addOutputs(api);
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
        const api = new aws_apigateway.RestApi(this, "my-api", {
            restApiName: "My API Gateway",
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

    private createTables(): Tables {
        // DynamoDB tables
        const productsTable = new aws_dynamodb.Table(this, "products", {
            tableName: 'products',
            partitionKey: {
                name: "id",
                type: aws_dynamodb.AttributeType.STRING,
            },
        });

        const stocksTable = new aws_dynamodb.Table(this, "stocks", {
            tableName: 'stocks',
            partitionKey: {
                name: "product_id",
                type: aws_dynamodb.AttributeType.STRING,
            },
        });

        return { productsTable, stocksTable };
    }

    private createLambda(tables: Tables): Lambdas {
        const { productsTable, stocksTable } = tables;
        // Lambda default configuration
        const defaultLambdaConfig = {
            ...LambdaDefaultConfig,
            environment: {
                PRODUCTS_TABLE_NAME: productsTable.tableName,
                STOCKS_TABLE_NAME: stocksTable.tableName
            }
        }

        // Get products list Lambda function
        const lambdaGetProductsList = new aws_lambda.Function(this, 'get-products-list-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/getProductsList`),
            ...defaultLambdaConfig
        });

        // Grant read permissions to Lambda functions
        productsTable.grantReadData(lambdaGetProductsList);
        stocksTable.grantReadData(lambdaGetProductsList);

        // Get product by ID Lambda function
        const lambdaGetProductsById = new aws_lambda.Function(this, 'get-products-by-id-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/getProductsById`),
            ...defaultLambdaConfig
        });

        // Grant read permissions to Lambda functions
        productsTable.grantReadData(lambdaGetProductsById);
        stocksTable.grantReadData(lambdaGetProductsById);

        // Create product Lambda function
        const lambdaCreateProduct = new aws_lambda.Function(this, 'create-product-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/createProduct`),
            ...defaultLambdaConfig
        });

        // Grant read/write permissions to Lambda functions
        productsTable.grantReadWriteData(lambdaCreateProduct);
        stocksTable.grantReadWriteData(lambdaCreateProduct);

        return {
            getProductsList: lambdaGetProductsList,
            getProductsById: lambdaGetProductsById,
            createProduct: lambdaCreateProduct
        };
    }

    private addRoutes(api: aws_apigateway.RestApi, lambdas: Lambdas) {
        // Lambda integrations
        const listIntegration = new aws_apigateway.LambdaIntegration(lambdas.getProductsList);
        const getByIdIntegration = new aws_apigateway.LambdaIntegration(lambdas.getProductsById);
        const createIntegration = new aws_apigateway.LambdaIntegration(lambdas.createProduct);

        // Products resource
        const productsResource = api.root.addResource("products");
        productsResource.addMethod('GET', listIntegration);
        productsResource.addMethod('POST', createIntegration);

        const productIdResource = productsResource.addResource("{productId}");
        productIdResource.addMethod('GET', getByIdIntegration);
    }

    private addOutputs(api: aws_apigateway.RestApi) {
        new CfnOutput(this, 'ApiEndpoint', {
            value: api.url,
        });

        new CfnOutput(this, 'ApiCustomDomain', {
            value: `https://${API_DOMAIN_NAME}`,
            description: 'The custom API domain URL',
        });
    }

}
