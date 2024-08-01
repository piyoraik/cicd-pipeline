import {
  CodeCommitClient,
  GetDifferencesCommand,
  GetFileCommand,
} from '@aws-sdk/client-codecommit';
import {
  BedrockRuntime,
  ConverseCommand,
  Message,
} from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntime({region: 'us-east-1'});
const codeCommitClient = new CodeCommitClient({region: 'ap-northeast-1'});
const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';

export const handler = async (event: any) => {
  const snsMessage = JSON.parse(event['Records'][0]['Sns']['Message']);
  console.log(snsMessage);

  // CodeCommit
  try {
    // 変更ファイル取得
    const getDiffInput = {
      repositoryName: process.env.repositoryName,
      afterCommitSpecifier: snsMessage.detail.afterCommitId,
    };
    const getDiffCommand = new GetDifferencesCommand(getDiffInput);
    const resGetDiff = await codeCommitClient.send(getDiffCommand);
    console.log('--------- differences ---------');
    console.log(resGetDiff.differences);

    if (resGetDiff.differences === undefined) {
      console.log('--------- undefined ---------');
      return;
    }

    // 変更ファイルの内容取得
    for (const blob of resGetDiff.differences) {
      console.log(blob.afterBlob);

      if (blob.afterBlob === undefined || blob.afterBlob.path === undefined)
        continue;
      // File取得
      const getBlobInput = {
        repositoryName: process.env.repositoryName,
        filePath: blob.afterBlob.path,
        commitSpecifier: 'test',
      };
      const getFileCommand = new GetFileCommand(getBlobInput);
      const resGetFile = await codeCommitClient.send(getFileCommand);
      console.log('--------- GetBlobCommand ---------');
      console.log(resGetFile.fileContent);
    }
  } catch (err: any) {
    console.error(err);
  }

  // Bedrock
  const userMessage =
    'Golang で Hello World を出力する最低限のプログラムを書いてください。';
  const conversation: Message[] = [
    {
      role: 'user',
      content: [
        {
          text: userMessage,
        },
      ],
    },
  ];

  const bedrockCommand = new ConverseCommand({
    modelId,
    messages: conversation,
    inferenceConfig: {maxTokens: 512, temperature: 0.5, topP: 0.9},
  });

  try {
    const {output} = await bedrockClient.send(bedrockCommand);

    if (
      output !== undefined &&
      output.message !== undefined &&
      output.message.content !== undefined
    ) {
      const responseText = output.message.content[0].text;
      return {
        statusCode: 200,
        body: responseText,
      };
    } else {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Unexpected response format from Bedrock',
        }),
      };
    }
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({message: `Error invoking Bedrock: ${err.message}`}),
    };
  }
};
