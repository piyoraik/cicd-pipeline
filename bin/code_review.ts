#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {CICDStack} from '../lib/cicd-stack';

const app = new cdk.App();
new CICDStack(app, 'CICDStack', {});
