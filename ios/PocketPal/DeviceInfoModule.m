#import "DeviceInfoModule.h"
#import <React/RCTLog.h>

@implementation DeviceInfoModule

RCT_EXPORT_MODULE(DeviceInfoModule);

RCT_EXPORT_METHOD(getCPUInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSUInteger numberOfCPUCores = [[NSProcessInfo processInfo] activeProcessorCount];
    NSDictionary *result = @{@"cores": @(numberOfCPUCores)};
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_cpu_info", @"Could not retrieve CPU info", nil);
  }
}

@end
