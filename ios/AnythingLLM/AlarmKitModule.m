#import <React/RCTBridgeModule.h>

// Exposes the Swift AlarmKitModule to React Native.
@interface RCT_EXTERN_MODULE(AlarmKitModule, NSObject)

RCT_EXTERN_METHOD(schedule:(double)fireAt
                  label:(NSString *)label
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
