#import "DeviceInfoModule.h"
#import <React/RCTLog.h>
#import <os/proc.h>
#import <mach/mach.h>

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
    // 0 means the process has no memory limit (the simulator) - fall back to the host's free memory.
    if (available == 0) available = [self hostFreeMemory];
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

// What this process may use in total before jetsam kills it: its footprint now plus what it may still
// allocate. 0 when the process has no limit (the simulator). Synchronous so model lists can badge on first render.
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getAppMemoryLimit)
{
  size_t available = os_proc_available_memory();
  if (available == 0) return @(0);
  task_vm_info_data_t info;
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) return @(available);
  return @((unsigned long long)available + info.phys_footprint);
}

/** Free plus reclaimable (inactive) pages, the host-wide equivalent of Android's availMem */
- (size_t)hostFreeMemory
{
  vm_statistics64_data_t stats;
  mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;
  if (host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&stats, &count) != KERN_SUCCESS) return 0;
  return ((size_t)stats.free_count + stats.inactive_count) * vm_page_size;
}

@end
