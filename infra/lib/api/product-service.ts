import {
    aws_apigateway,
    aws_dynamodb,
    aws_lambda,
    CfnOutput,
    RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { API_DOMAIN_NAME, LambdaDefaultConfig } from "../shared/config";

const path = './../api/dist';

export interface ProductServiceProps {
    sharedApi: aws_apigateway.RestApi;
    authorizer: aws_apigateway.IAuthorizer;
}

interface Lambdas {
    getProductsList: aws_lambda.Function;
    getProductsById: aws_lambda.Function;
    createProduct: aws_lambda.Function;
    updateProduct: aws_lambda.Function;
    deleteProduct: aws_lambda.Function;
}

interface Tables {
    productsTable: aws_dynamodb.Table;
    stocksTable: aws_dynamodb.Table;
}

export class ProductService extends Construct {

    public readonly tables: Tables;

    constructor(scope: Construct, id: string, props: ProductServiceProps) {
        super(scope, id);

        const { sharedApi, authorizer } = props;

        this.tables = this.createTables();
        const lambdas = this.createLambda(this.tables);

        this.addRoutes(sharedApi, lambdas, authorizer);
    }

    private createTables(): Tables {
        // DynamoDB tables
        const productsTable = new aws_dynamodb.Table(this, "products", {
            tableName: 'products',
            partitionKey: {
                name: "id",
                type: aws_dynamodb.AttributeType.STRING,
            },
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const stocksTable = new aws_dynamodb.Table(this, "stocks", {
            tableName: 'stocks',
            partitionKey: {
                name: "product_id",
                type: aws_dynamodb.AttributeType.STRING,
            },
            removalPolicy: RemovalPolicy.DESTROY,
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

        const lambdasReadOnlyList = [];
        const lambdasReadWriteList = [];

        // Get products list Lambda function
        const lambdaGetProductsList = new aws_lambda.Function(this, 'get-products-list-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/getProductsList`),
            ...defaultLambdaConfig
        });
        lambdasReadOnlyList.push(lambdaGetProductsList);

        // Get product by ID Lambda function
        const lambdaGetProductsById = new aws_lambda.Function(this, 'get-products-by-id-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/getProductsById`),
            ...defaultLambdaConfig
        });
        lambdasReadOnlyList.push(lambdaGetProductsById);

        // Create product Lambda function
        const lambdaCreateProduct = new aws_lambda.Function(this, 'create-product-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/createProduct`),
            ...defaultLambdaConfig
        });
        lambdasReadWriteList.push(lambdaCreateProduct);

        // Update product Lambda function
        const lambdaUpdateProduct = new aws_lambda.Function(this, 'update-product-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/updateProduct`),
            ...defaultLambdaConfig
        });
        lambdasReadWriteList.push(lambdaUpdateProduct);

        // Delete product Lambda function
        const lambdaDeleteProduct = new aws_lambda.Function(this, 'delete-product-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/deleteProduct`),
            ...defaultLambdaConfig
        });
        lambdasReadWriteList.push(lambdaDeleteProduct);

        // Grant read permissions to Lambda functions
        lambdasReadOnlyList.forEach((lambda) => {
            productsTable.grantReadData(lambda);
            stocksTable.grantReadData(lambda);
        });

        // Grant read/write permissions to Lambda functions
        lambdasReadWriteList.forEach((lambda) => {
            productsTable.grantReadWriteData(lambda);
            stocksTable.grantReadWriteData(lambda);
        });

        return {
            getProductsList: lambdaGetProductsList,
            getProductsById: lambdaGetProductsById,
            createProduct: lambdaCreateProduct,
            updateProduct: lambdaUpdateProduct,
            deleteProduct: lambdaDeleteProduct
        };
    }

    private addRoutes(api: aws_apigateway.RestApi, lambdas: Lambdas, authorizer: aws_apigateway.IAuthorizer) {
        // Lambda integrations
        const listIntegration = new aws_apigateway.LambdaIntegration(lambdas.getProductsList);
        const getByIdIntegration = new aws_apigateway.LambdaIntegration(lambdas.getProductsById);
        const createIntegration = new aws_apigateway.LambdaIntegration(lambdas.createProduct);
        const updateIntegration = new aws_apigateway.LambdaIntegration(lambdas.updateProduct);
        const deleteIntegration = new aws_apigateway.LambdaIntegration(lambdas.deleteProduct);

        // Products resource
        const productsResource = api.root.addResource("products");
        productsResource.addMethod('GET', listIntegration);
        productsResource.addMethod('POST', createIntegration, {
            authorizer
        });

        const productIdResource = productsResource.addResource("{productId}");
        productIdResource.addMethod('GET', getByIdIntegration);
        productIdResource.addMethod('PUT', updateIntegration, {
            authorizer
        });
        productIdResource.addMethod('DELETE', deleteIntegration, {
            authorizer
        });
    }
}
