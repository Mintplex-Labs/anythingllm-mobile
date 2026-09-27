#import "DeviceInfoModule.h"
#import <React/RCTLog.h>
#import <os/proc.h>

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

// iOS has no system-wide "available" figure - os_proc_available_memory is how much more this
// process may allocate before jetsam kills it, which is the number that matters for loading a model.
RCT_EXPORT_METHOD(getMemoryInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    unsigned long long total = [[NSProcessInfo processInfo] physicalMemory];
    size_t available = os_proc_available_memory();
    NSDictionary *result = @{
      @"total": @(total),
      @"available": @(available),
      @"threshold": @(0),
      @"lowMemory": @(NO),
    };
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_memory_info", @"Could not retrieve memory info", nil);
  }
}

@end
