#import "ScreenLockModule.h"
#import <UIKit/UIKit.h>

/**
 * Reports whether the device is currently locked.
 *
 * iOS has no public "is the screen locked" API. The closest signal is protected-data
 * availability: once the device locks with a passcode, the data-protection keychain/files
 * become unavailable and `isProtectedDataAvailable` flips to NO. A device with no passcode
 * never reports as locked here, and the caller falls back to app-state alone in that case.
 */
@implementation ScreenLockModule

RCT_EXPORT_MODULE(ScreenLockModule);

RCT_EXPORT_METHOD(isLocked:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIApplication *app = [UIApplication sharedApplication];
    BOOL backgrounded = app.applicationState == UIApplicationStateBackground;
    BOOL locked = backgrounded && !app.isProtectedDataAvailable;
    resolve(@(locked));
  });
}

@end
