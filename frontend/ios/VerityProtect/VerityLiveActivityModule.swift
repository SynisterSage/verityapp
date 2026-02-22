import Foundation
import React

#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(VerityLiveActivityModule)
class VerityLiveActivityModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func startCallActivity(
    _ payload: NSDictionary,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else {
      resolver(["ok": false, "reason": "unsupported_ios_version"])
      return
    }

    guard let callSid = (payload["callSid"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !callSid.isEmpty else {
      rejecter("LIVE_ACTIVITY_BAD_INPUT", "Missing callSid", nil)
      return
    }

    let state = parseState(payload)
    let attributes = VerityCallLiveActivityAttributes(
      callSid: callSid,
      profileId: (payload["profileId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    )

    Task {
      if let existing = findActivity(callSid: callSid) {
        await existing.update(using: state)
        resolver(["ok": true, "updated": true])
        return
      }

      do {
        _ = try Activity<VerityCallLiveActivityAttributes>.request(
          attributes: attributes,
          contentState: state,
          pushType: nil
        )
        resolver(["ok": true, "started": true])
      } catch {
        rejecter(
          "LIVE_ACTIVITY_START_FAILED",
          error.localizedDescription,
          error
        )
      }
    }
#else
    resolver(["ok": false, "reason": "activitykit_unavailable"])
#endif
  }

  @objc
  func updateCallActivity(
    _ payload: NSDictionary,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else {
      resolver(["ok": false, "reason": "unsupported_ios_version"])
      return
    }

    guard let callSid = (payload["callSid"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !callSid.isEmpty else {
      rejecter("LIVE_ACTIVITY_BAD_INPUT", "Missing callSid", nil)
      return
    }

    guard let activity = findActivity(callSid: callSid) else {
      resolver(["ok": false, "reason": "not_found"])
      return
    }

    let state = parseState(payload)
    Task {
      await activity.update(using: state)
      resolver(["ok": true])
    }
#else
    resolver(["ok": false, "reason": "activitykit_unavailable"])
#endif
  }

  @objc
  func endCallActivity(
    _ payload: NSDictionary,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else {
      resolver(["ok": false, "reason": "unsupported_ios_version"])
      return
    }

    let callSid = (payload["callSid"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let state = parseState(payload)

    Task {
      let activities = Activity<VerityCallLiveActivityAttributes>.activities
      let matching = activities.filter { activity in
        guard let callSid, !callSid.isEmpty else {
          return true
        }
        return activity.attributes.callSid == callSid
      }

      for activity in matching {
        await activity.end(using: state, dismissalPolicy: .immediate)
      }
      resolver(["ok": true, "endedCount": matching.count])
    }
#else
    resolver(["ok": false, "reason": "activitykit_unavailable"])
#endif
  }
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
private func findActivity(callSid: String) -> Activity<VerityCallLiveActivityAttributes>? {
  Activity<VerityCallLiveActivityAttributes>.activities.first { activity in
    activity.attributes.callSid == callSid
  }
}

private func parseOptionalString(_ value: Any?) -> String? {
  guard let stringValue = value as? String else {
    return nil
  }
  let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? nil : trimmed
}

@available(iOS 16.1, *)
private func parseState(_ payload: NSDictionary) -> VerityCallLiveActivityAttributes.ContentState {
  let status = parseOptionalString(payload["status"]) ?? "Connecting"
  let label = parseOptionalString(payload["label"]) ?? "Protected Call"
  let callerName = parseOptionalString(payload["callerName"]) ?? "Incoming Call"
  let callerNumber = parseOptionalString(payload["callerNumber"])
  let isTrusted = (payload["isTrusted"] as? Bool) ?? false
  let connectedAtEpochSeconds = (payload["connectedAtEpochSeconds"] as? NSNumber)?.doubleValue

  return VerityCallLiveActivityAttributes.ContentState(
    status: status,
    label: label,
    callerName: callerName,
    callerNumber: callerNumber,
    isTrusted: isTrusted,
    connectedAtEpochSeconds: connectedAtEpochSeconds
  )
}
#endif
