import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { describe, expect, it } from 'vitest';
import { MacroMapStack } from '../src/macromap-stack.js';

const bannedResourceTypes = [
  'AWS::EC2::NatGateway',
  'AWS::EC2::VPCEndpoint',
  'AWS::ECS::Cluster',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::RDS::DBProxy',
  'AWS::Route53::HostedZone',
  'AWS::Scheduler::Schedule',
] as const;

const app = new App();
const certificateStack = new Stack(app, 'CertificateStack', {
  env: { account: '111111111111', region: 'us-east-1' },
});
const certificate = acm.Certificate.fromCertificateArn(
  certificateStack,
  'Certificate',
  'arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000001',
);
const stack = new MacroMapStack(app, 'TestStack', {
  certificate,
  env: { account: '111111111111', region: 'eu-west-2' },
  hostedZoneId: 'Z11111111111111111111',
  webAssetPath: new URL('./fixtures/web/', import.meta.url).pathname,
});
const template = Template.fromStack(stack);

describe('approved infrastructure foundation', () => {
  it('uses one auto-pausing Aurora writer with the Data API', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      DatabaseName: 'macromap',
      DeletionProtection: true,
      EnableHttpEndpoint: true,
      Engine: 'aurora-postgresql',
      ManageMasterUserPassword: true,
      ServerlessV2ScalingConfiguration: {
        MaxCapacity: 1,
        MinCapacity: 0,
        SecondsUntilAutoPause: 300,
      },
      StorageEncrypted: true,
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.serverless',
      PubliclyAccessible: false,
    });
  });

  it('keeps the API private and bounded', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 4,
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      RouteKey: 'GET /v1/session',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      RouteKey: 'PUT /v1/household-settings',
    });
    for (const routeKey of [
      'GET /v1/recipes',
      'GET /v1/recipes/{recipeId}',
      'PUT /v1/recipes/{recipeId}',
      'DELETE /v1/recipes/{recipeId}',
      'POST /v1/recipes/{recipeId}/photos',
      'PUT /v1/recipes/{recipeId}/photos/{uploadId}',
      'DELETE /v1/recipes/{recipeId}/photos',
    ]) {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        AuthorizationType: 'JWT',
        RouteKey: routeKey,
      });
    }
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 10,
        ThrottlingRateLimit: 5,
      },
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      GenerateSecret: false,
    });
  });

  it('stores recipe photos privately and removes abandoned uploads', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
          },
        ],
      },
      LifecycleConfiguration: {
        Rules: [
          {
            ExpirationInDays: 1,
            Prefix: 'uploads/',
            Status: 'Enabled',
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('does not introduce expensive or duplicate infrastructure', () => {
    const resources = template.toJSON().Resources as Record<
      string,
      { Type: string }
    >;
    const resourceTypes = Object.values(resources).map(({ Type }) => Type);

    for (const resourceType of bannedResourceTypes) {
      expect(resourceTypes).not.toContain(resourceType);
    }
  });

  it('creates both approved budget thresholds', () => {
    template.resourceCountIs('AWS::Budgets::Budget', 2);
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 8, Unit: 'USD' } },
    });
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 15, Unit: 'USD' } },
    });
  });
});
