import { Stack, Tags, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { APPLICATION_NAME } from './config.js';

export class MacroMapStack extends Stack {
  public constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('Application', APPLICATION_NAME);
    Tags.of(this).add('Environment', 'production');
    Tags.of(this).add('ManagedBy', 'CDK');
  }
}
