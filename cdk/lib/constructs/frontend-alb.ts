import { Construct } from "constructs";
import { RemovalPolicy, Stack, App } from "aws-cdk-lib";
import { Bucket, BucketEncryption, BlockPublicAccess, IBucket } from "aws-cdk-lib/aws-s3";
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, ListenerAction, ListenerCertificate, SslPolicy, TargetType } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { NodejsBuild } from "deploy-time-build";
import { Auth } from "./auth";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { DnsValidatedCertificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";


export interface FrontendALBProps {
  readonly backendApiEndpoint: string;
  readonly webSocketApiEndpoint: string;
  readonly auth: Auth;
  readonly accessLogBucket: IBucket;
  readonly vpc: ec2.IVpc;
  readonly webAclId: string;
}

export class FrontendALB extends Construct {
  readonly alb: ApplicationLoadBalancer;
  constructor(scope: Construct, id: string, props: FrontendALBProps) {
    super(scope, id);

    const assetBucket = new Bucket(this, "AssetBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // const targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
    //   vpc: props.vpc,
    //   protocol: ApplicationProtocol.HTTP,
    //   port: 8080,
    //   targetType: TargetType.IP,
    // });

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    this.alb = new ApplicationLoadBalancer(this, "ALB", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: securityGroup,
      loadBalancerName: "bedrock-claude-chatbot"
    });

    // Associate the web ACL with the Application Load Balancer
    new wafv2.CfnWebACLAssociation(this, "AlbWafAssociation", {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: props.webAclId,
    });
    
    // Set ALB with access log bucket
    this.alb.logAccessLogs(props.accessLogBucket);
    // new route53.HostedZone(this, "HostedZone", {
    //   zoneName: this.alb.loadBalancerDnsName,
    // });
    
    // //Set ALB with route 53
    // const zone = new route53.HostedZone(this, "HostedZone", {
    //   zoneName: this.alb.loadBalancerDnsName,
    // });
    
    // const certificateArn = 'arn:aws:acm-pca:us-east-1:519930237078:certificate-authority/3670fd57-54fe-4d0e-84e7-7f1a5ce2d572'; // replace with your certificate ARN
    // const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);


    // new route53.CnameRecord(this, "CnameRecord", {
    //   zone: zone,
    //   recordName: this.alb.loadBalancerDnsName,
    //   domainName: this.alb.loadBalancerDnsName,
    // });
    const listener = this.alb.addListener('Listener', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      // certificates: [ListenerCertificate.fromCertificateManager(certificate)],
      // defaultAction: ListenerAction.fixedResponse(200),
    });
  
    const targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
      vpc: props.vpc,
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      targetType: TargetType.IP,
      targetGroupName: "bedrock-claude-chatbot",
    });

    // Assign target groups to the listener of the alb
    listener.addTargetGroups("TargetGroups", {
      targetGroups: [targetGroup],
    });
    // const s3ProxyLambda = new lambda.Function(this, 'S3ProxyLambda', {
    //   runtime: lambda.Runtime.NODEJS_12_X,
    //   handler: 'index.handler',
    //   code: lambda.Code.fromAsset('lambda'),
    // });

    // listener.addRule('LambdaRule', {
    //   priority: 1,
    //   conditions: [elbv2.ListenerCondition.pathPatterns(['/lambda/*'])],
    //   action: elbv2.ListenerAction.forward([targetGroup]),
    // });
  
    // new route53.ARecord(this, 'AliasRecord', {
    //   zone,
    //   recordName: 'www',
    //   target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(this.alb)),
    // });

    // listener.addTargetGroups("TargetGroup", {
    //   targetGroups: [targetGroup],
    // });

    new NodejsBuild(this, "ReactBuild", {
      assets: [
        {
          path: "../frontend",
          exclude: ["node_modules", "dist"],
          commands: ["npm ci"],
        },
      ],
      buildCommands: ["npm run build"],
      buildEnvironment: {
        VITE_APP_API_ENDPOINT: props.backendApiEndpoint,
        VITE_APP_WS_ENDPOINT: props.webSocketApiEndpoint,
        VITE_APP_USER_POOL_ID: props.auth.userPool.userPoolId,
        VITE_APP_USER_POOL_CLIENT_ID: props.auth.client.userPoolClientId,
        VITE_APP_REGION: Stack.of(props.auth.userPool).region,
        VITE_APP_USE_STREAMING: "true",
      },
      destinationBucket: assetBucket,
      outputSourceDirectory: "dist",
      loadBalancer: this.alb
    });
  }

  getOrigin(): string {
    return `http://${this.alb.loadBalancerDnsName}`;
  }
}