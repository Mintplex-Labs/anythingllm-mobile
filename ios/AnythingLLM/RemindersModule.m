#import "RemindersModule.h"
#import <EventKit/EventKit.h>

// Adds reminders to the Reminders app, which then owns them: it alerts at the due time and is
// where the user changes, completes or deletes them.
@interface RemindersModule ()
@property (nonatomic, strong) EKEventStore *eventStore;
@end

@implementation RemindersModule

RCT_EXPORT_MODULE(RemindersModule);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Saves a reminder due at `fireAt` (epoch millis) with an alert at that time, in the user's default
// list, asking for Reminders access the first time. Resolves with its id. Rejects with
// `reminders_permission_denied` or `no_reminders_list`.
RCT_EXPORT_METHOD(save:(NSString *)title
                  fireAt:(double)fireAt
                  notes:(NSString *)notes
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  if (!self.eventStore) self.eventStore = [EKEventStore new];
  EKEventStore *store = self.eventStore;
  void (^save)(BOOL, NSError *) = ^(BOOL granted, NSError *accessError) {
    if (!granted) return reject(@"reminders_permission_denied", @"Reminders access was not allowed", accessError);
    EKCalendar *list = [store defaultCalendarForNewReminders];
    if (!list) return reject(@"no_reminders_list", @"There is no reminders list to add to", nil);

    NSDate *due = [NSDate dateWithTimeIntervalSince1970:fireAt / 1000];
    EKReminder *reminder = [EKReminder reminderWithEventStore:store];
    reminder.title = title;
    reminder.notes = notes;
    reminder.calendar = list;
    reminder.dueDateComponents = [NSCalendar.currentCalendar
      components:NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay | NSCalendarUnitHour | NSCalendarUnitMinute
      fromDate:due];
    [reminder addAlarm:[EKAlarm alarmWithAbsoluteDate:due]];

    NSError *error = nil;
    if (![store saveReminder:reminder commit:YES error:&error]) return reject(@"save_failed", error.localizedDescription, error);
    resolve(reminder.calendarItemIdentifier);
  };

  if (@available(iOS 17.0, *)) [store requestFullAccessToRemindersWithCompletion:save];
  else [store requestAccessToEntityType:EKEntityTypeReminder completion:save];
}

@end
