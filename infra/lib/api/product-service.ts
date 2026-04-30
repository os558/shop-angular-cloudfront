import {
    aws_apigateway,
    aws_dynamodb,
    aws_lambda,
    CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { API_DOMAIN_NAME, LambdaDefaultConfig } from "../shared/config";

const path = './../api/dist';

export interface ProductServiceProps {
    sharedApi: aws_apigateway.RestApi;
}

interface Lambdas {
    getProductsList: aws_lambda.Function;
    getProductsById: aws_lambda.Function;
    createProduct: aws_lambda.Function;
}

interface Tables {
    productsTable: aws_dynamodb.Table;
    stocksTable: aws_dynamodb.Table;
}

export class ProductService extends Construct {

    public readonly tables: Tables;

    constructor(scope: Construct, id: string, props: ProductServiceProps) {
        super(scope, id);

        this.tables = this.createTables();
        const lambdas = this.createLambda(this.tables);

        this.addRoutes(props.sharedApi, lambdas);
        this.addOutputs(props.sharedApi);
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
