#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { MacroMapBootstrapStack } from '../src/bootstrap-stack.js';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;

if (account === undefined) {
  throw new Error(
    'CDK_DEFAULT_ACCOUNT is required to synth the bootstrap stack',
  );
}

new MacroMapBootstrapStack(app, 'MacroMapGitHubBootstrap', {
  env: { account, region: 'eu-west-2' },
  terminationProtection: true,
});

app.synth();
