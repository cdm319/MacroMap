import { Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import { APPLICATION_DOMAIN, APPLICATION_NAME, ROOT_DOMAIN } from './config.js';

export interface MacroMapEdgeStackProps extends StackProps {
  hostedZoneId: string;
}

export class MacroMapEdgeStack extends Stack {
  public readonly certificate: acm.ICertificate;

  public constructor(
    scope: Construct,
    id: string,
    props: MacroMapEdgeStackProps,
  ) {
    super(scope, id, props);

    Tags.of(this).add('Application', APPLICATION_NAME);
    Tags.of(this).add('Environment', 'production');
    Tags.of(this).add('ManagedBy', 'CDK');

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      { hostedZoneId: props.hostedZoneId, zoneName: ROOT_DOMAIN },
    );
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: APPLICATION_DOMAIN,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}
