import { aws_apigateway, aws_cognito, aws_lambda, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DOMAIN_NAME, LambdaDefaultConfig } from "../shared/config";

const path = './../api/dist';

export class AuthorizationService extends Construct {
    public readonly authorizer: aws_apigateway.IAuthorizer;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const useCognito = process.env.USE_COGNITO === 'true';

        this.authorizer = useCognito ? this.createCognitoAuthorizer() : this.createLambdaAuthorizer();
    }

    private createLambdaAuthorizer(): aws_apigateway.IAuthorizer {
        const lambdaBasicAuthorizer = new aws_lambda.Function(this, 'basic-authorizer-lambda', {
            code: aws_lambda.Code.fromAsset(`${path}/basicAuthorizer`),
            ...LambdaDefaultConfig,
            environment: {
                BASIC_USER: process.env.BASIC_USER || '',
                BASIC_PASSWORD: process.env.BASIC_PASSWORD || ''
            }
        });

        return new aws_apigateway.TokenAuthorizer(this, 'BasicAuthorizer', {
            handler: lambdaBasicAuthorizer,
        });
    }

    private createCognitoAuthorizer(): aws_apigateway.IAuthorizer {
        const userPool = new aws_cognito.UserPool(this, "my-user-pool", {
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            customAttributes: {
                createdAt: new aws_cognito.DateTimeAttribute(),
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: false,
                requireDigits: true,
                requireSymbols: false,
            },
            removalPolicy: RemovalPolicy.DESTROY,
        });
        const domainPrefix = `shop-angular-cloudfront`;
        userPool.addDomain('ShopUserPoolDomain', {
            cognitoDomain: {
                domainPrefix,
            },
        });

        const clientCallbackUrls = [
            'http://localhost:4200',
            'http://localhost:4200/',
            `https://${DOMAIN_NAME}`,
            `https://${DOMAIN_NAME}/`
        ];

        const userPoolClient = userPool.addClient('ShopUserPoolClient', {
            userPoolClientName: 'shop-angular-client',
            generateSecret: false,
            oAuth: {
                flows: {
                    implicitCodeGrant: true, // SPA flow returning token directly in URL hash
                },
                scopes: [aws_cognito.OAuthScope.OPENID, aws_cognito.OAuthScope.EMAIL, aws_cognito.OAuthScope.PROFILE],
                callbackUrls: clientCallbackUrls,
                logoutUrls: clientCallbackUrls,
            },
        });

        const authorizer = new aws_apigateway.CognitoUserPoolsAuthorizer(
            this,
            "CognitoUserPoolsAuthorizer",
            {
                authorizerName: "CognitoUserPoolsAuthorizer",
                cognitoUserPools: [userPool],
            }
        );

        new CfnOutput(this, 'CognitoLoginUrl', {
            value: `https://${domainPrefix}.auth.us-east-1.amazoncognito.com/login?client_id=${userPoolClient.userPoolClientId}&response_type=token&scope=email+openid+profile&redirect_uri=http://localhost:4200`,
            description: 'Cognito Hosted UI Login URL (for local dev)',
        });

        return authorizer;
    }
}
