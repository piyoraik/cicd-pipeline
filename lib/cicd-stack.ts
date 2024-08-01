import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import {Runtime} from 'aws-cdk-lib/aws-lambda';
import {LogGroup, RetentionDays} from 'aws-cdk-lib/aws-logs';
import {SnsEventSource} from 'aws-cdk-lib/aws-lambda-event-sources';
import {Construct} from 'constructs';

export class CICDStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SNS
    const topic = new sns.Topic(this, 's-tanaka-topic-01', {
      topicName: 's-tanaka-topic-01',
    });

    // CodeCommit
    const repository = new codecommit.Repository(
      this,
      's-tanaka-code-commit-01',
      {
        repositoryName: 's-tanaka-code-commit-01',
        code: codecommit.Code.fromDirectory(
          path.join(__dirname, '..', 'lambda/'),
          'main'
        ),
      }
    );
    repository.notifyOn('notify', topic, {
      notificationRuleName: 's-tanaka-code-commit-01-notify',
      events: [
        codecommit.RepositoryNotificationEvents.PULL_REQUEST_COMMENT,
        codecommit.RepositoryNotificationEvents.PULL_REQUEST_CREATED,
        codecommit.RepositoryNotificationEvents.PULL_REQUEST_SOURCE_UPDATED,
      ],
    });

    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository,
      output: sourceOutput,
    });

    // CodeBuild
    const buildProject = new codebuild.Project(this, 's-tanaka-code-build-01', {
      source: codebuild.Source.codeCommit({repository}),
      projectName: 's-tanaka-code-build-01',
      buildSpec: codebuild.BuildSpec.fromAsset(
        path.join(__dirname, '..', 'pipeline/build/buildspec.yml')
      ),
    });

    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 's-tanaka-code-pipeline', {
      pipelineName: 's-tanaka-code-pipeline',
      crossAccountKeys: false,
      enableKeyRotation: false,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
      ],
    });

    // IAM
    const bedrockFunctionRole = new iam.Role(
      this,
      's-tanaka-bedrock-fn-role-01',
      {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      }
    );
    bedrockFunctionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicExecutionRole'
      )
    );
    bedrockFunctionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess')
    );
    bedrockFunctionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeCommitReadOnly')
    );

    // Logs
    const bedrockFunctionLogs = new LogGroup(
      this,
      's-tanaka-bedrock-fn-01-logs',
      {
        logGroupName: 's-tanaka-bedrock-fn-01-logs',
        retention: RetentionDays.ONE_DAY,
      }
    );

    // Lambda
    const bedrockFunction = new lambda.NodejsFunction(
      this,
      's-tanaka-bedrock-fn-01',
      {
        functionName: 's-tanaka-bedrock-fn-01',
        runtime: Runtime.NODEJS_20_X,
        entry: 'lambda/review.ts',
        handler: 'handler',
        role: bedrockFunctionRole,
        timeout: cdk.Duration.seconds(60),
        logGroup: bedrockFunctionLogs,
        environment: {
          repositoryName: repository.repositoryName,
        },
      }
    );
    bedrockFunction.addEventSource(
      new SnsEventSource(topic, {
        filterPolicy: {},
      })
    );
  }
}
