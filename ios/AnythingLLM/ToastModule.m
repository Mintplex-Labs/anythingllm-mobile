#import "ToastModule.h"
#import <UIKit/UIKit.h>

// iOS has no system toast. This draws a short-lived pill above the bottom safe area of the key
// window, styled like Android's Toast, and replaces any toast that is still showing.
@implementation ToastModule

static UIView *currentToast;

RCT_EXPORT_MODULE(ToastModule);

RCT_EXPORT_METHOD(show:(NSString *)message durationSeconds:(double)durationSeconds)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *window = [ToastModule keyWindow];
    if (!window || message.length == 0) return;

    [currentToast removeFromSuperview];

    UILabel *label = [UILabel new];
    label.text = message;
    label.numberOfLines = 0;
    label.textAlignment = NSTextAlignmentCenter;
    label.textColor = UIColor.whiteColor;
    label.font = [UIFont systemFontOfSize:15];
    label.translatesAutoresizingMaskIntoConstraints = NO;

    UIView *toast = [UIView new];
    toast.backgroundColor = [UIColor colorWithWhite:0.15 alpha:0.94];
    toast.layer.cornerRadius = 18;
    toast.userInteractionEnabled = NO;
    toast.alpha = 0;
    toast.translatesAutoresizingMaskIntoConstraints = NO;
    [toast addSubview:label];
    [window addSubview:toast];

    [NSLayoutConstraint activateConstraints:@[
      [label.topAnchor constraintEqualToAnchor:toast.topAnchor constant:10],
      [label.bottomAnchor constraintEqualToAnchor:toast.bottomAnchor constant:-10],
      [label.leadingAnchor constraintEqualToAnchor:toast.leadingAnchor constant:16],
      [label.trailingAnchor constraintEqualToAnchor:toast.trailingAnchor constant:-16],
      [toast.centerXAnchor constraintEqualToAnchor:window.centerXAnchor],
      [toast.widthAnchor constraintLessThanOrEqualToAnchor:window.widthAnchor constant:-48],
      [toast.bottomAnchor constraintEqualToAnchor:window.safeAreaLayoutGuide.bottomAnchor constant:-72],
    ]];

    currentToast = toast;
    [UIView animateWithDuration:0.2 animations:^{ toast.alpha = 1; }];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(durationSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      [UIView animateWithDuration:0.3 animations:^{ toast.alpha = 0; } completion:^(BOOL finished) {
        [toast removeFromSuperview];
        if (currentToast == toast) currentToast = nil;
      }];
    });
  });
}

+ (UIWindow *)keyWindow
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isKeyWindow) return window;
    }
  }
  return nil;
}

@end
