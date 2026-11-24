import AlarmKit
import Foundation
import SwiftUI

/// Alarms that ring like the Clock app's - full screen, through silent mode and Focus - using
/// AlarmKit. The system owns an alarm once it is scheduled, so it rings even if the app is closed.
@objc(AlarmKitModule)
class AlarmKitModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// Schedules a one-off alarm at `fireAt` (epoch millis) titled `label`, asking for permission
  /// the first time. Rejects with `unavailable` before iOS 26.1 and `alarms_denied` when the
  /// user has not allowed alarms.
  @objc(schedule:label:resolve:reject:)
  func schedule(_ fireAt: Double, label: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.1, *) else {
      reject("unavailable", "Alarms need iOS 26.1 or later", nil)
      return
    }
    Task {
      do {
        guard try await AlarmManager.shared.requestAuthorization() == .authorized else {
          reject("alarms_denied", "Alarms were not allowed", nil)
          return
        }
        let alert = AlarmPresentation.Alert(title: LocalizedStringResource(String.LocalizationValue(label)))
        let attributes = AlarmAttributes<ReminderAlarmMetadata>(presentation: AlarmPresentation(alert: alert), tintColor: .blue)
        let date = Date(timeIntervalSince1970: fireAt / 1000)
        _ = try await AlarmManager.shared.schedule(id: UUID(), configuration: .alarm(schedule: .fixed(date), attributes: attributes))
        resolve(nil)
      } catch {
        reject("schedule_failed", error.localizedDescription, error)
      }
    }
  }
}

/// AlarmKit needs a metadata type even when an alarm carries nothing beyond its title.
@available(iOS 26.0, *)
struct ReminderAlarmMetadata: AlarmMetadata {}
