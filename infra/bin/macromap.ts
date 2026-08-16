#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import {
  APPLICATION_NAME,
  PRODUCTION_REGION,
  ROOT_HOSTED_ZONE_ID,
} from '../src/config.js';
import { MacroMapEdgeStack } from '../src/edge-stack.js';
import { MacroMapStack } from '../src/macromap-stack.js';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const environment = (region: string) =>
  account === undefined ? { region } : { account, region };

const edge = new MacroMapEdgeStack(app, `${APPLICATION_NAME}Edge`, {
  crossRegionReferences: true,
  env: environment('us-east-1'),
  hostedZoneId: ROOT_HOSTED_ZONE_ID,
  terminationProtection: true,
});
new MacroMapStack(app, `${APPLICATION_NAME}Production`, {
  certificate: edge.certificate,
  crossRegionReferences: true,
  env: environment(PRODUCTION_REGION),
  hostedZoneId: ROOT_HOSTED_ZONE_ID,
  terminationProtection: true,
});

app.synth();
