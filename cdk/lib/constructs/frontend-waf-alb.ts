import * as cdk from "aws-cdk-lib";
import { CfnOutput, StackProps } from "aws-cdk-lib";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface FrontendWafALBProps extends StackProps {
  readonly allowedIpV4AddressRanges: string[];
  readonly allowedIpV6AddressRanges: string[];
  readonly vpc: ec2.IVpc;
}

/**
 * Frontend WAF
 */
export class FrontendWafALB extends Construct {

  public readonly webAclArn: CfnOutput;

  constructor(scope: Construct, id: string, props: FrontendWafALBProps) {
    super(scope, id);
    // create Ipset for ACL
    const ipV4SetReferenceStatement = new wafv2.CfnIPSet(
      this,
      "FrontendIpV4Set",
      {
        ipAddressVersion: "IPV4",
        scope: "REGIONAL",
        addresses: props.allowedIpV4AddressRanges,
      }
    );
    const ipV6SetReferenceStatement = new wafv2.CfnIPSet(
      this,
      "FrontendIpV6Set",
      {
        ipAddressVersion: "IPV6",
        scope: "REGIONAL",
        addresses: props.allowedIpV6AddressRanges,
      }
    );

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      defaultAction: { block: {} },
      name: "FrontendWebAcl",
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "FrontendWebAcl",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          priority: 0,
          name: "FrontendWebAclIpV4RuleSet",
          action: { allow: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "FrontendWebAcl",
            sampledRequestsEnabled: true,
          },
          statement: {
            ipSetReferenceStatement: { arn: ipV4SetReferenceStatement.attrArn },
          },
        },
        {
          priority: 1,
          name: "FrontendWebAclIpV6RuleSet",
          action: { allow: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "FrontendWebAcl",
            sampledRequestsEnabled: true,
          },
          statement: {
            ipSetReferenceStatement: { arn: ipV6SetReferenceStatement.attrArn },
          },
        },
      ],
    });

    // // create private and public subnets
    // const privatesubnetIds = props.vpc.privateSubnets.map((subnet) => subnet.subnetId);

    // const securityGroupId = new ec2.SecurityGroup(this, "SecurityGroup", {
    //   vpc: props.vpc,
    //   allowAllOutbound: true,
    // }).securityGroupId;

    // // Associate the web ACL with the Application Load Balancer
    // const alb = new wafv2.CfnWebACLAssociation(this, "AlbWafAssociation", {
    //   resourceArn: `arn:aws:elasticloadbalancing:${Stack.of(this).region}:${
    //     Stack.of(this).account
    //   }:loadbalancer/app/${privatesubnetIds.join("/")}/${
    //     securityGroupId
    //   }`,
    //   webAclArn: webAcl.attrArn,
    // });

    this.webAclArn = new cdk.CfnOutput(this, "WebAclId", {
      value: webAcl.attrArn,
    });

  }
}