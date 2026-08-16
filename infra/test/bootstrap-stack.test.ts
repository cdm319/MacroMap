import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { MacroMapBootstrapStack } from '../src/bootstrap-stack.js';

describe('GitHub bootstrap infrastructure', () => {
  it('restricts deployment to the protected production environment', () => {
    const app = new App();
    const stack = new MacroMapBootstrapStack(app, 'BootstrapTest', {
      env: { account: '111111111111', region: 'eu-west-2' },
    });
    const template = Template.fromStack(stack);

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
      Description: 'Lets protected MacroMap CI assume CDK bootstrap roles',
    });
    template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  });
});
