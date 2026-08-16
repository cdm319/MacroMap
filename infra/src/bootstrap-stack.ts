import { CfnOutput, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { APPLICATION_NAME, GITHUB_REPOSITORY } from './config.js';

export class MacroMapBootstrapStack extends Stack {
  public constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    Tags.of(this).add('Application', APPLICATION_NAME);
    Tags.of(this).add('Environment', 'production');
    Tags.of(this).add('ManagedBy', 'CDK');

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubProvider',
      `arn:${this.partition}:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const productionSubject = `repo:${GITHUB_REPOSITORY}:environment:production`;
    const pullRequestSubjects = [
      `repo:${GITHUB_REPOSITORY}:pull_request`,
      `repo:${GITHUB_REPOSITORY}:ref:refs/heads/main`,
    ];

    const deployRole = new iam.Role(this, 'DeployRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': productionSubject,
          },
        },
      ),
      description: 'Lets protected MacroMap CI assume CDK bootstrap roles',
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-role-${this.account}-eu-west-2`,
          `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-role-${this.account}-us-east-1`,
        ],
      }),
    );

    const diffRole = new iam.Role(this, 'DiffRole', {
      assumedBy: new iam.WebIdentityPrincipal(
        provider.openIdConnectProviderArn,
        {
          'ForAnyValue:StringEquals': {
            'token.actions.githubusercontent.com:sub': pullRequestSubjects,
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        },
      ),
      description: 'Lets MacroMap CI produce read-only infrastructure diffs',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
      ],
    });
    diffRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-eu-west-2`,
          `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-us-east-1`,
        ],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'DiffRoleArn', { value: diffRole.roleArn });
  }
}
