#import "ComposeModule.h"
#import <React/RCTUtils.h>
#import <MessageUI/MessageUI.h>
#import <EventKitUI/EventKitUI.h>

// The system's own compose sheets, shown over the app: a text in Messages, an email in Mail and a
// new event in Calendar. Each fills in the draft and leaves sending or saving to the user. One
// sheet at a time - a second request while one is open is rejected.
@interface ComposeModule () <MFMessageComposeViewControllerDelegate, MFMailComposeViewControllerDelegate, EKEventEditViewDelegate>
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, strong) EKEventStore *eventStore;
@end

@implementation ComposeModule

RCT_EXPORT_MODULE(ComposeModule);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

// Rejects with `unavailable` when the phone cannot send texts (no Messages, eg: an iPad without iMessage).
RCT_EXPORT_METHOD(composeText:(NSString *)phoneNumber
                  body:(NSString *)body
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  if (![MFMessageComposeViewController canSendText]) return reject(@"unavailable", @"This device cannot send text messages", nil);
  if (![self begin:resolve reject:reject]) return;
  MFMessageComposeViewController *composer = [MFMessageComposeViewController new];
  composer.messageComposeDelegate = self;
  composer.body = body;
  if (phoneNumber.length > 0) composer.recipients = @[phoneNumber];
  [RCTPresentedViewController() presentViewController:composer animated:YES completion:nil];
}

// Rejects with `unavailable` when no account is set up in the Mail app.
RCT_EXPORT_METHOD(composeEmail:(NSArray<NSString *> *)to
                  cc:(NSArray<NSString *> *)cc
                  subject:(NSString *)subject
                  body:(NSString *)body
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  if (![MFMailComposeViewController canSendMail]) return reject(@"unavailable", @"No account is set up in Mail", nil);
  if (![self begin:resolve reject:reject]) return;
  MFMailComposeViewController *composer = [MFMailComposeViewController new];
  composer.mailComposeDelegate = self;
  [composer setToRecipients:to];
  [composer setCcRecipients:cc];
  [composer setSubject:subject];
  [composer setMessageBody:body isHTML:NO];
  [RCTPresentedViewController() presentViewController:composer animated:YES completion:nil];
}

// Calendar's new event editor, filled in with the draft. Resolves with the start of the event the
// user added in epoch millis (they may have changed it), or null when they cancelled.
RCT_EXPORT_METHOD(composeEvent:(NSDictionary *)draft
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  // The editor runs outside the app from iOS 17 and needs no calendar access. Before that it needs write access.
  if (@available(iOS 17.0, *)) return [self presentEventEditor:draft resolve:resolve reject:reject];
  if (!self.eventStore) self.eventStore = [EKEventStore new];
  [self.eventStore requestAccessToEntityType:EKEntityTypeEvent completion:^(BOOL granted, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!granted) return reject(@"permission_denied", @"Calendar access was not allowed", error);
      [self presentEventEditor:draft resolve:resolve reject:reject];
    });
  }];
}

- (void)presentEventEditor:(NSDictionary *)draft resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (![self begin:resolve reject:reject]) return;
  if (!self.eventStore) self.eventStore = [EKEventStore new];
  EKEvent *event = [EKEvent eventWithEventStore:self.eventStore];
  event.title = draft[@"title"];
  event.startDate = [NSDate dateWithTimeIntervalSince1970:[draft[@"beginTime"] doubleValue] / 1000];
  event.endDate = [NSDate dateWithTimeIntervalSince1970:[draft[@"endTime"] doubleValue] / 1000];
  event.allDay = [draft[@"allDay"] boolValue];
  event.location = [draft[@"location"] isKindOfClass:NSString.class] ? draft[@"location"] : nil;
  event.notes = [draft[@"notes"] isKindOfClass:NSString.class] ? draft[@"notes"] : nil;
  if ([draft[@"url"] isKindOfClass:NSString.class]) event.URL = [NSURL URLWithString:draft[@"url"]];
  for (NSNumber *minutes in draft[@"reminderMinutes"]) {
    [event addAlarm:[EKAlarm alarmWithRelativeOffset:-minutes.doubleValue * 60]];
  }
  EKRecurrenceRule *rule = [ComposeModule recurrenceRule:draft[@"recurrence"]];
  if (rule) [event addRecurrenceRule:rule];

  EKEventEditViewController *editor = [EKEventEditViewController new];
  editor.eventStore = self.eventStore;
  editor.event = event;
  editor.editViewDelegate = self;
  [RCTPresentedViewController() presentViewController:editor animated:YES completion:nil];
}

// `{ frequency, interval, byDay, until, count }` as the calendar tool drafts it - nil when the event does not repeat.
+ (EKRecurrenceRule *)recurrenceRule:(id)recurrence
{
  if (![recurrence isKindOfClass:NSDictionary.class]) return nil;
  NSDictionary<NSString *, NSNumber *> *frequencies = @{
    @"daily": @(EKRecurrenceFrequencyDaily),
    @"weekly": @(EKRecurrenceFrequencyWeekly),
    @"monthly": @(EKRecurrenceFrequencyMonthly),
    @"yearly": @(EKRecurrenceFrequencyYearly),
  };
  NSNumber *frequency = frequencies[recurrence[@"frequency"] ?: @""];
  if (!frequency) return nil;
  EKRecurrenceEnd *end = nil;
  if ([recurrence[@"until"] isKindOfClass:NSNumber.class]) {
    end = [EKRecurrenceEnd recurrenceEndWithEndDate:[NSDate dateWithTimeIntervalSince1970:[recurrence[@"until"] doubleValue] / 1000]];
  } else if ([recurrence[@"count"] isKindOfClass:NSNumber.class]) {
    end = [EKRecurrenceEnd recurrenceEndWithOccurrenceCount:[recurrence[@"count"] integerValue]];
  }
  // iCalendar day codes in EKWeekday order (Sunday is 1). No days means the start date's weekday.
  NSArray<NSString *> *dayCodes = @[@"SU", @"MO", @"TU", @"WE", @"TH", @"FR", @"SA"];
  NSMutableArray<EKRecurrenceDayOfWeek *> *days = [NSMutableArray new];
  for (NSString *code in recurrence[@"byDay"]) {
    NSUInteger index = [dayCodes indexOfObject:code];
    if (index != NSNotFound) [days addObject:[EKRecurrenceDayOfWeek dayOfWeek:index + 1]];
  }
  NSInteger interval = MAX(1, [recurrence[@"interval"] integerValue]);
  return [[EKRecurrenceRule alloc] initRecurrenceWithFrequency:frequency.integerValue
                                                      interval:interval
                                                 daysOfTheWeek:days.count ? days : nil
                                                daysOfTheMonth:nil
                                               monthsOfTheYear:nil
                                                weeksOfTheYear:nil
                                                 daysOfTheYear:nil
                                                  setPositions:nil
                                                           end:end];
}

// Claims the single sheet slot. Rejects and returns NO when a sheet is already open.
- (BOOL)begin:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (self.resolve) {
    reject(@"busy", @"Another compose sheet is already open", nil);
    return NO;
  }
  self.resolve = resolve;
  return YES;
}

- (void)finish:(UIViewController *)controller result:(id)result
{
  RCTPromiseResolveBlock resolve = self.resolve;
  self.resolve = nil;
  [controller dismissViewControllerAnimated:YES completion:nil];
  if (resolve) resolve(result);
}

- (void)messageComposeViewController:(MFMessageComposeViewController *)controller didFinishWithResult:(MessageComposeResult)result
{
  [self finish:controller result:@(result == MessageComposeResultSent)];
}

- (void)mailComposeController:(MFMailComposeViewController *)controller didFinishWithResult:(MFMailComposeResult)result error:(NSError *)error
{
  [self finish:controller result:@(result == MFMailComposeResultSent)];
}

- (void)eventEditViewController:(EKEventEditViewController *)controller didCompleteWithAction:(EKEventEditViewAction)action
{
  BOOL saved = action == EKEventEditViewActionSaved && controller.event.startDate;
  [self finish:controller result:saved ? @(controller.event.startDate.timeIntervalSince1970 * 1000) : (id)kCFNull];
}

@end
