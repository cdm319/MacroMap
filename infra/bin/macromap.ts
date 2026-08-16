#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { APPLICATION_NAME, PRODUCTION_REGION } from '../src/config.js';
import { MacroMapEdgeStack } from '../src/edge-stack.js';
import { MacroMapStack } from '../src/macromap-stack.js';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const hostedZoneId =
  process.env.MACROMAP_HOSTED_ZONE_ID ?? 'Z00000000000000000000';

if (account !== undefined && hostedZoneId === 'Z00000000000000000000') {
  throw new Error('MACROMAP_HOSTED_ZONE_ID is required for an AWS synth');
}

const environment = (region: string) =>
  account === undefined ? { region } : { account, region };

const edge = new MacroMapEdgeStack(app, `${APPLICATION_NAME}Edge`, {
  crossRegionReferences: true,
  env: environment('us-east-1'),
  hostedZoneId,
  terminationProtection: true,
});
new MacroMapStack(app, `${APPLICATION_NAME}Production`, {
  certificate: edge.certificate,
  crossRegionReferences: true,
  env: environment(PRODUCTION_REGION),
  hostedZoneId,
  terminationProtection: true,
});

app.synth();
