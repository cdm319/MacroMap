import { App, Validations } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { APPROVED_COST_GUARDRAILS } from '../src/config.js';
import { MacroMapStack } from '../src/macromap-stack.js';

const bannedResourceTypes = [
  'AWS::EC2::NatGateway',
  'AWS::EC2::VPCEndpoint',
  'AWS::ECS::Cluster',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBProxy',
  'AWS::Route53::HostedZone',
] as const;

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

  it('synthesises without excluded infrastructure', () => {
    const app = new App();
    Validations.of(app).acknowledge({
      id: 'CloudFormation-Validate::F0001',
      reason:
        'The Phase 0 stack deliberately contains no deployable resources.',
    });
    const stack = new MacroMapStack(app, 'TestStack');
    const resources = Template.fromStack(stack).toJSON().Resources ?? {};
    const resourceTypes = Object.values(resources).map(
      (resource) => (resource as { Type: string }).Type,
    );

    for (const resourceType of bannedResourceTypes) {
      expect(resourceTypes).not.toContain(resourceType);
    }
  });
});
