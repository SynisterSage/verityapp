import Foundation

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct VerityCallLiveActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var status: String
    var label: String
    var callerName: String
    var callerNumber: String?
    var isTrusted: Bool
    var connectedAtEpochSeconds: Double?
  }

  var callSid: String
  var profileId: String?
}
#endif
