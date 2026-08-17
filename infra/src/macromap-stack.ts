import { join } from 'node:path';
import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  type StackProps,
} from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpStage,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';
import {
  APPLICATION_DOMAIN,
  APPLICATION_NAME,
  APPROVED_COST_GUARDRAILS,
  DATABASE_NAME,
  PRODUCTION_REGION,
  ROOT_DOMAIN,
} from './config.js';

export interface MacroMapStackProps extends StackProps {
  certificate: ICertificate;
  hostedZoneId: string;
  webAssetPath?: string;
}

export class MacroMapStack extends Stack {
  public constructor(scope: Construct, id: string, props: MacroMapStackProps) {
    super(scope, id, props);

    Tags.of(this).add('Application', APPLICATION_NAME);
    Tags.of(this).add('Environment', 'production');
    Tags.of(this).add('ManagedBy', 'CDK');

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: ROOT_DOMAIN,
      },
    );

    const network = new ec2.Vpc(this, 'Network', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/24'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 26,
          name: 'database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const database = new rds.DatabaseCluster(this, 'Database', {
      backup: { retention: Duration.days(1) },
      credentials: rds.Credentials.fromUsername('macromap_admin'),
      defaultDatabaseName: DATABASE_NAME,
      deletionProtection: true,
      enableDataApi: true,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_13,
      }),
      manageMasterUserPassword: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      serverlessV2AutoPauseDuration: Duration.seconds(
        APPROVED_COST_GUARDRAILS.auroraAutoPauseSeconds,
      ),
      serverlessV2MaxCapacity: APPROVED_COST_GUARDRAILS.auroraMaximumCapacity,
      serverlessV2MinCapacity: APPROVED_COST_GUARDRAILS.auroraMinimumCapacity,
      storageEncrypted: true,
      storageType: rds.DBClusterStorageType.AURORA,
      vpc: network as ec2.IVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      autoVerify: { email: true },
      removalPolicy: RemovalPolicy.RETAIN,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
    });
    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      generateSecret: false,
      oAuth: {
        callbackUrls: [`https://${APPLICATION_DOMAIN}/`],
        flows: { authorizationCodeGrant: true },
        logoutUrls: [`https://${APPLICATION_DOMAIN}/`],
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
      },
      preventUserExistenceErrors: true,
    });
    const userPoolDomain = userPool.addDomain('HostedDomain', {
      cognitoDomain: { domainPrefix: `macromap-${this.account}` },
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const sessionFunction = new lambdaNodejs.NodejsFunction(
      this,
      'SessionFunction',
      {
        architecture: lambda.Architecture.ARM_64,
        bundling: {
          bundleAwsSDK: true,
          minify: true,
          sourceMap: true,
        },
        entry: join(import.meta.dirname, '../../apps/api/src/handler.ts'),
        environment: {
          DATABASE_NAME,
          DATABASE_RESOURCE_ARN: database.clusterArn,
          DATABASE_SECRET_ARN: database.secret!.secretArn,
        },
        handler: 'handler',
        logGroup: apiLogGroup,
        memorySize: 256,
        reservedConcurrentExecutions:
          APPROVED_COST_GUARDRAILS.apiLambdaReservedConcurrency,
        runtime: lambda.Runtime.NODEJS_24_X,
        timeout: Duration.seconds(20),
      },
    );
    database.grantDataApiAccess(sessionFunction);

    const api = new HttpApi(this, 'Api', {
      corsPreflight: {
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.PUT],
        allowOrigins: [`https://${APPLICATION_DOMAIN}`],
      },
      createDefaultStage: false,
    });
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${PRODUCTION_REGION}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );
    api.addRoutes({
      authorizer,
      integration: new HttpLambdaIntegration(
        'SessionIntegration',
        sessionFunction,
      ),
      methods: [HttpMethod.GET],
      path: '/v1/session',
    });
    api.addRoutes({
      authorizer,
      integration: new HttpLambdaIntegration(
        'SettingsIntegration',
        sessionFunction,
      ),
      methods: [HttpMethod.PUT],
      path: '/v1/household-settings',
    });
    new HttpStage(this, 'DefaultStage', {
      autoDeploy: true,
      httpApi: api,
      stageName: '$default',
      throttle: {
        burstLimit: APPROVED_COST_GUARDRAILS.apiBurstLimit,
        rateLimit: APPROVED_COST_GUARDRAILS.apiRateLimit,
      },
    });

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const webOrigin = origins.S3BucketOrigin.withOriginAccessControl(
      webBucket as s3.IBucket,
    );
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      certificate: props.certificate,
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        origin: webOrigin,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      domainNames: [APPLICATION_DOMAIN],
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    distribution.addBehavior('/config.json', webOrigin, {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });

    new s3Deployment.BucketDeployment(this, 'WebDeployment', {
      destinationBucket: webBucket as s3.IBucket,
      distribution,
      distributionPaths: ['/*'],
      sources: [
        s3Deployment.Source.asset(
          props.webAssetPath ?? join(import.meta.dirname, '../../apps/web/out'),
        ),
        s3Deployment.Source.jsonData('config.json', {
          apiBaseUrl: api.apiEndpoint,
          authBaseUrl: userPoolDomain.baseUrl(),
          clientId: userPoolClient.userPoolClientId,
          mode: 'cognito',
          redirectUri: `https://${APPLICATION_DOMAIN}/`,
        }),
      ],
    });

    new route53.ARecord(this, 'AliasRecord', {
      recordName: APPLICATION_DOMAIN,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
      zone: hostedZone,
    });
    new route53.AaaaRecord(this, 'AliasIpv6Record', {
      recordName: APPLICATION_DOMAIN,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
      zone: hostedZone,
    });

    const budgetEmail = new CfnParameter(this, 'BudgetNotificationEmail', {
      description: 'Email address for MacroMap cost notifications',
      noEcho: true,
      type: 'String',
    });
    this.addBudget(
      'WarningBudget',
      APPROVED_COST_GUARDRAILS.warningBudgetUsd,
      budgetEmail.valueAsString,
    );
    this.addBudget(
      'UrgentBudget',
      APPROVED_COST_GUARDRAILS.urgentBudgetUsd,
      budgetEmail.valueAsString,
    );

    new CfnOutput(this, 'ApiBaseUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'DatabaseName', { value: DATABASE_NAME });
    new CfnOutput(this, 'DatabaseResourceArn', {
      value: database.clusterArn,
    });
    new CfnOutput(this, 'DatabaseSecretArn', {
      value: database.secret!.secretArn,
    });
    new CfnOutput(this, 'SiteUrl', {
      value: `https://${APPLICATION_DOMAIN}`,
    });
    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
  }

  private addBudget(id: string, amount: number, email: string): void {
    new budgets.CfnBudget(this, id, {
      budget: {
        budgetLimit: { amount, unit: 'USD' },
        budgetType: 'COST',
        costFilters: {
          TagKeyValue: [`user:Application$${APPLICATION_NAME}`],
        },
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: ['ACTUAL', 'FORECASTED'].map(
        (notificationType) => ({
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType,
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ address: email, subscriptionType: 'EMAIL' }],
        }),
      ),
    });
  }
}
