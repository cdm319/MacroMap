#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { PRODUCTION_REGION } from '../src/config.js';
import { MacroMapStack } from '../src/macromap-stack.js';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const environment =
  account === undefined
    ? { region: PRODUCTION_REGION }
    : { account, region: PRODUCTION_REGION };

new MacroMapStack(app, 'MacroMapProduction', {
  env: environment,
  terminationProtection: true,
});

app.synth();
