import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { MacroMapEdgeStack } from '../src/edge-stack.js';

describe('edge infrastructure', () => {
  it('creates only the CloudFront certificate in us-east-1', () => {
    const app = new App();
    const stack = new MacroMapEdgeStack(app, 'EdgeTest', {
      env: { account: '111111111111', region: 'us-east-1' },
      hostedZoneId: 'Z11111111111111111111',
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    template.resourceCountIs('AWS::Route53::HostedZone', 0);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'macromap.chrismatthews.me',
      ValidationMethod: 'DNS',
    });
  });
});
