import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class CdkStaticServerlessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // We start by creating an S3 Bucket where we are going to
    // store our static website.
    const bucket = new s3.Bucket(this, 'StaticWebsiteBucket', {
      bucketName: Stack.of(this).account + '-static-website-test',
      websiteIndexDocument: 'index.html',

      // We don't want anybody to access our s3 content directly.
      // We want to use CloudFront to serve it.
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Creating an Origin Access Identity which we will associate with our s3 bucket to
    // enable CloudFront to serve content from it.
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'cloudfront-OAI', {
      comment: `OAI for ${id}`
    });

    // Adding the resource policy to s3, here we reference the cloudfrontOAI resource and now
    // CloudFront has access to the bucket content based on the set actions & resources.
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));

    // Now access has been provided we create the actual cloudfront distribution, referencing the bucket
    // the origin access identity and default behaviors.
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'StaticWebsiteDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
            originAccessIdentity: cloudfrontOAI
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              compress: true,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS
            }
          ]
        }
      ]
    });

    // With s3deploy we can make sure that on every deploy the contents of ./static is pushed to s3
    // after this has been done it also invalidates the cache on the cloudfront distribution
    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [s3deploy.Source.asset('./static')],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // We are using CfnOutput to output the CloudFront URL to the console and the CloudFormation interface
    new CfnOutput(this, 'WebsiteURL', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
