import AppIntents
import Foundation

@available(iOS 16.0, *)
private enum VeritySiriRoute {
  static let alerts = "verityprotect://alerts"
  static let alertsNeeds = "verityprotect://alerts?mode=needs"
  static let alertsHistory = "verityprotect://alerts?mode=history"
  static let calls = "verityprotect://calls"
  static let callsTrusted = "verityprotect://calls?filter=trusted"
  static let supportPortal = "verityprotect://support-portal"
}

@available(iOS 16.0, *)
private enum VeritySiriStorage {
  static let appGroupIdentifier = "group.com.lexferguson.verityprotect.com"
  static let pendingSiriRouteKey = "alertsWidget.pendingSiriRoute"
  static let needsAttentionKey = "alertsWidget.needsAttentionCount"
  static let historyCountKey = "alertsWidget.historyCount"
}

@available(iOS 16.0, *)
private func persistPendingSiriRoute(_ route: String) {
  guard let defaults = UserDefaults(suiteName: VeritySiriStorage.appGroupIdentifier) else {
    return
  }
  defaults.set(route, forKey: VeritySiriStorage.pendingSiriRouteKey)
}

@available(iOS 16.0, *)
private func readAlertSnapshotCounts() -> (needsAttention: Int, history: Int) {
  guard let defaults = UserDefaults(suiteName: VeritySiriStorage.appGroupIdentifier) else {
    return (0, 0)
  }
  return (
    max(0, defaults.integer(forKey: VeritySiriStorage.needsAttentionKey)),
    max(0, defaults.integer(forKey: VeritySiriStorage.historyCountKey))
  )
}

@available(iOS 16.0, *)
struct OpenAlertsIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Alerts"
  static var description = IntentDescription("Open the Alerts screen.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    persistPendingSiriRoute(VeritySiriRoute.alerts)
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenNeedsAttentionIntent: AppIntent {
  static var title: LocalizedStringResource = "Show Needs Attention"
  static var description = IntentDescription("Open Alerts filtered to Needs Attention.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    persistPendingSiriRoute(VeritySiriRoute.alertsNeeds)
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenAlertHistoryIntent: AppIntent {
  static var title: LocalizedStringResource = "Show Alert History"
  static var description = IntentDescription("Open Alerts filtered to History.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    persistPendingSiriRoute(VeritySiriRoute.alertsHistory)
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenCallsIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Calls"
  static var description = IntentDescription("Open the Calls screen.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    persistPendingSiriRoute(VeritySiriRoute.calls)
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenTrustedCallsIntent: AppIntent {
  static var title: LocalizedStringResource = "Show Trusted Calls"
  static var description = IntentDescription("Open Calls filtered to Trusted activity.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    persistPendingSiriRoute(VeritySiriRoute.callsTrusted)
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenSupportPortalIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Support"
  static var description = IntentDescription("Open the Support portal.")
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    persistPendingSiriRoute(VeritySiriRoute.supportPortal)
    return .result()
  }
}

@available(iOS 16.0, *)
struct ReadAlertStatusIntent: AppIntent {
  static var title: LocalizedStringResource = "What Is My Alert Status"
  static var description = IntentDescription("Read your current needs-attention and history alert counts.")

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let counts = readAlertSnapshotCounts()
    let statusLabel = counts.needsAttention > 0 ? "Needs Attention" : "All Clear"
    let dialog: IntentDialog = "Status: \(statusLabel). You have \(counts.needsAttention) needs attention and \(counts.history) in history."
    return .result(dialog: dialog)
  }
}

@available(iOS 16.0, *)
struct VerityAppShortcutsProvider: AppShortcutsProvider {
  static var shortcutTileColor: ShortcutTileColor = .blue

  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenAlertsIntent(),
      phrases: [
        "Open Alerts in \(.applicationName)",
        "Show Alerts in \(.applicationName)",
        "Alerts in \(.applicationName)",
      ],
      shortTitle: "Open Alerts",
      systemImageName: "bell.badge"
    )
    AppShortcut(
      intent: OpenNeedsAttentionIntent(),
      phrases: [
        "Show Needs Attention in \(.applicationName)",
        "Open Needs Attention in \(.applicationName)",
        "Needs Attention in \(.applicationName)",
      ],
      shortTitle: "Needs Attention",
      systemImageName: "exclamationmark.bubble"
    )
    AppShortcut(
      intent: OpenAlertHistoryIntent(),
      phrases: [
        "Show Alert History in \(.applicationName)",
        "Open Alert History in \(.applicationName)",
        "Alert History in \(.applicationName)",
      ],
      shortTitle: "Alert History",
      systemImageName: "clock.arrow.circlepath"
    )
    AppShortcut(
      intent: OpenCallsIntent(),
      phrases: [
        "Open Calls in \(.applicationName)",
        "Show Calls in \(.applicationName)",
        "Calls in \(.applicationName)",
      ],
      shortTitle: "Open Calls",
      systemImageName: "phone"
    )
    AppShortcut(
      intent: OpenTrustedCallsIntent(),
      phrases: [
        "Show Trusted Calls in \(.applicationName)",
        "Open Trusted Calls in \(.applicationName)",
        "Trusted Calls in \(.applicationName)",
      ],
      shortTitle: "Trusted Calls",
      systemImageName: "checkmark.shield"
    )
    AppShortcut(
      intent: OpenSupportPortalIntent(),
      phrases: [
        "Open Support in \(.applicationName)",
        "Show Support in \(.applicationName)",
        "Support in \(.applicationName)",
      ],
      shortTitle: "Open Support",
      systemImageName: "person.text.rectangle"
    )
    AppShortcut(
      intent: ReadAlertStatusIntent(),
      phrases: [
        "What's My Alert Status in \(.applicationName)",
        "Read My Alert Status in \(.applicationName)",
        "Alert Status in \(.applicationName)",
      ],
      shortTitle: "Alert Status",
      systemImageName: "waveform.path.ecg"
    )
  }
}
