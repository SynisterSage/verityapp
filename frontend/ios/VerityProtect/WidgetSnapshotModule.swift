import Foundation
import React
import WidgetKit

@objc(WidgetSnapshotModule)
class WidgetSnapshotModule: NSObject {
  private let appGroupIdentifier = "group.com.lexferguson.verityprotect.com"
  private let needsAttentionKey = "alertsWidget.needsAttentionCount"
  private let historyCountKey = "alertsWidget.historyCount"
  private let lastUpdatedKey = "alertsWidget.lastUpdatedEpochSeconds"
  private let profileIdKey = "alertsWidget.profileId"
  private let widgetKinds = [
    "VerityProtectAlertsWidget",
    "VerityProtectHistoryWidget",
  ]

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func updateSnapshot(
    _ payload: NSDictionary,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      rejecter("WIDGET_STORE_ERROR", "Unable to access shared widget storage", nil)
      return
    }

    let needsAttention = (payload["needsAttentionCount"] as? NSNumber)?.intValue ?? 0
    let historyCount = (payload["historyCount"] as? NSNumber)?.intValue ?? 0
    let profileId = payload["profileId"] as? String

    let nowEpochSeconds = Date().timeIntervalSince1970
    let lastUpdatedEpochSeconds = (payload["lastUpdatedEpochSeconds"] as? NSNumber)?.doubleValue ?? nowEpochSeconds

    defaults.set(max(0, needsAttention), forKey: needsAttentionKey)
    defaults.set(max(0, historyCount), forKey: historyCountKey)
    defaults.set(lastUpdatedEpochSeconds, forKey: lastUpdatedKey)
    if let profileId, !profileId.isEmpty {
      defaults.set(profileId, forKey: profileIdKey)
    }

    if #available(iOS 14.0, *) {
      widgetKinds.forEach { kind in
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
      }
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolver([
      "ok": true,
      "needsAttentionCount": max(0, needsAttention),
      "historyCount": max(0, historyCount),
      "lastUpdatedEpochSeconds": lastUpdatedEpochSeconds,
    ])
  }

  @objc
  func clearSnapshot(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      rejecter("WIDGET_STORE_ERROR", "Unable to access shared widget storage", nil)
      return
    }

    defaults.removeObject(forKey: needsAttentionKey)
    defaults.removeObject(forKey: historyCountKey)
    defaults.removeObject(forKey: lastUpdatedKey)
    defaults.removeObject(forKey: profileIdKey)

    if #available(iOS 14.0, *) {
      widgetKinds.forEach { kind in
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
      }
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolver(["ok": true])
  }
}
