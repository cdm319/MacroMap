import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { describe, expect, it } from 'vitest';
import { APPROVED_COST_GUARDRAILS } from '../src/config.js';
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

function productionTemplate(): Template {
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

  return Template.fromStack(stack);
}

describe('approved infrastructure foundation', () => {
  it('keeps the approved cost limits explicit', () => {
    expect(APPROVED_COST_GUARDRAILS).toEqual({
      apiBurstLimit: 10,
      apiLambdaReservedConcurrency: 4,
      apiRateLimit: 5,
      auroraAutoPauseSeconds: 300,
      auroraMaximumCapacity: 1,
      auroraMinimumCapacity: 0,
      logRetentionDays: 14,
      plannerLambdaReservedConcurrency: 1,
      schedulerCount: 1,
      urgentBudgetUsd: 15,
      warningBudgetUsd: 8,
    });
  });

  it('uses one auto-pausing Aurora writer with the Data API', () => {
    const template = productionTemplate();

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

  it('caps and protects the authenticated API', () => {
    const template = productionTemplate();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      Environment: {
        Variables: Match.objectLike({ DATABASE_NAME: 'macromap' }),
      },
      MemorySize: 256,
      ReservedConcurrentExecutions: 4,
      Runtime: 'nodejs24.x',
      Timeout: 20,
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      RouteKey: 'GET /v1/session',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      AutoDeploy: true,
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 10,
        ThrottlingRateLimit: 5,
      },
      StageName: '$default',
    });
  });

  it('keeps sign-up private and uses a public authorization-code client', () => {
    const template = productionTemplate();

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      AutoVerifiedAttributes: ['email'],
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      GenerateSecret: false,
      SupportedIdentityProviders: ['COGNITO'],
    });
  });

  it('serves a private static site with DNS and no duplicate hosted zone', () => {
    const template = productionTemplate();
    const resources = template.toJSON().Resources as Record<
      string,
      { Type: string }
    >;

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: Match.objectLike({}),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['macromap.chrismatthews.me'],
        DefaultRootObject: 'index.html',
        PriceClass: 'PriceClass_100',
      }),
    });
    template.resourceCountIs('AWS::Route53::RecordSet', 2);

    for (const resourceType of bannedResourceTypes) {
      expect(Object.values(resources).map(({ Type }) => Type)).not.toContain(
        resourceType,
      );
    }
  });

  it('creates both approved budget thresholds', () => {
    const template = productionTemplate();

    template.resourceCountIs('AWS::Budgets::Budget', 2);
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 8, Unit: 'USD' } },
    });
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 15, Unit: 'USD' } },
    });
  });

  it('limits the migration role to the protected production environment', () => {
    const template = productionTemplate();

    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              StringEquals: Match.objectLike({
                'token.actions.githubusercontent.com:sub':
                  'repo:cdm319/MacroMap:environment:production',
              }),
            },
          }),
        ]),
      },
      Description: 'Runs reviewed MacroMap SQL migrations from protected CI',
    });
  });
});
