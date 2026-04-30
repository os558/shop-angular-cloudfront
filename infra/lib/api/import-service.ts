import {
    aws_apigateway,
    aws_dynamodb,
    aws_lambda,
    aws_s3,
    aws_s3_notifications,
    CfnOutput,
    RemovalPolicy,
    aws_sqs,
    Duration,
    aws_sns,
    aws_sns_subscriptions,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { API_DOMAIN_NAME, DOMAIN_NAME, LambdaDefaultConfig } from "../shared/config";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

const path = './../api/dist';

export interface ImportServiceProps {
    sharedApi: aws_apigateway.RestApi;
    basicAuthorizer: aws_apigateway.IAuthorizer;
    tables: Tables;
}

interface Tables {
    productsTable: aws_dynamodb.Table;
    stocksTable: aws_dynamodb.Table;
}

interface Lambdas {
    lambdaImportProductsFile: aws_lambda.Function;
    lambdaImportFileParser: aws_lambda.Function;
    lambdaCatalogBatchProcess: aws_lambda.Function;
}

interface Buckets {
    importBucket: aws_s3.Bucket;
}

interface Queues {
    productsQueue: aws_sqs.Queue;
    dlq: aws_sqs.Queue;
}

interface Notifications {
    createProductTopic: aws_sns.Topic;
}

export class ImportService extends Construct {
    constructor(scope: Construct, id: string, props: ImportServiceProps) {
        super(scope, id);

        const { sharedApi, tables } = props;

        const buckets = this.createBuckets();
        const queues = this.createQueue();
        const notifications = this.createNotifications();

        const lambdas = this.createLambda(buckets, queues, notifications, tables);

        this.addEvents(buckets, lambdas);
        this.addRoutes(sharedApi, lambdas, props.basicAuthorizer);
        this.addOutputs(sharedApi);
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

                // S3 CORS rules – required so the browser can PUT directly via the pre-signed URL
                cors: [
                    {
                        allowedOrigins: ['http://localhost:4200', `https://${DOMAIN_NAME}`],
                        allowedMethods: [aws_s3.HttpMethods.PUT],
                        allowedHeaders: ['*'],
                        maxAge: 3000,
                    },
                ],
            });

        return { importBucket };
    }

    private createQueue(): Queues {
        const dlq = new aws_sqs.Queue(this, "DLQ", {
            queueName: "catalog-items-dlq",
            visibilityTimeout: Duration.seconds(30),
        });

        const queue = new aws_sqs.Queue(this, "ProductsQueue", {
            queueName: "catalog-items-queue",
            visibilityTimeout: Duration.seconds(30),
            deadLetterQueue: {
                queue: dlq,
                maxReceiveCount: 3,
            },
        });

        return { productsQueue: queue, dlq: dlq };
    }

    private createNotifications(): Notifications {
        const createProductTopic = new aws_sns.Topic(this, "import-bucket-notification", {
            topicName: "import-bucket-notification",
        });

        createProductTopic.addSubscription(new aws_sns_subscriptions.EmailSubscription("Oleh_Semeniuk1@epam.com"));

        return { createProductTopic };
    }

    private createLambda(buckets: Buckets, queues: Queues, notifications: Notifications, tables: Tables): Lambdas {
        const { importBucket } = buckets;
        const { productsQueue } = queues;
        const { createProductTopic, } = notifications;
        const { productsTable, stocksTable } = tables;

        // Lambda default configuration (shared env vars for all import lambdas)
        const defaultLambdaConfig = {
            ...LambdaDefaultConfig,
            environment: {
                BUCKET_NAME: importBucket.bucketName,
                PRODUCTS_QUEUE_URL: productsQueue.queueUrl,
                SNS_TOPIC_ARN: createProductTopic.topicArn,
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
        productsQueue.grantSendMessages(lambdaImportFileParser);

        // CatalogBatchProcess needs DynamoDB access in addition to the shared env vars
        const lambdaCatalogBatchProcess = new aws_lambda.Function(this, 'catalog-batch-process-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/catalogBatchProcess`),
            ...LambdaDefaultConfig,
            environment: {
                ...defaultLambdaConfig.environment,
                PRODUCTS_TABLE_NAME: productsTable.tableName,
                STOCKS_TABLE_NAME: stocksTable.tableName,
            }
        });

        // Grant DynamoDB read/write access to CatalogBatchProcess
        productsTable.grantReadWriteData(lambdaCatalogBatchProcess);
        stocksTable.grantReadWriteData(lambdaCatalogBatchProcess);

        lambdaCatalogBatchProcess.addEventSource(new SqsEventSource(productsQueue, {
            batchSize: 5
        }));

        createProductTopic.grantPublish(lambdaCatalogBatchProcess);

        return {
            lambdaImportProductsFile: lambdaImportProductsFile,
            lambdaImportFileParser: lambdaImportFileParser,
            lambdaCatalogBatchProcess: lambdaCatalogBatchProcess,
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

    private addRoutes(api: aws_apigateway.RestApi, lambdas: Lambdas, authorizer: aws_apigateway.IAuthorizer) {
        // Lambda integrations
        const importProductsFileIntegration = new aws_apigateway.LambdaIntegration(lambdas.lambdaImportProductsFile);

        // Products resource
        const productsResource = api.root.addResource("import");
        productsResource.addMethod('GET', importProductsFileIntegration, {
            authorizer
        });
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
