import SwiftUI
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit

@available(iOSApplicationExtension 16.1, *)
private struct VerityCallLockScreenView: View {
  let context: ActivityViewContext<VerityCallLiveActivityAttributes>

  private var statusColor: Color {
    switch context.state.status.lowercased() {
    case "connected":
      return .green
    case "reconnecting":
      return .orange
    case "ringing", "connecting":
      return .blue
    default:
      return .secondary
    }
  }

  private var connectedAt: Date? {
    guard let epoch = context.state.connectedAtEpochSeconds else {
      return nil
    }
    return Date(timeIntervalSince1970: epoch)
  }

  private var formattedCallerNumber: String? {
    guard let raw = context.state.callerNumber, !raw.isEmpty else {
      return nil
    }
    return formatPhoneNumber(raw)
  }

  private func formatPhoneNumber(_ raw: String) -> String {
    let digits = raw.filter(\.isNumber)
    if digits.isEmpty {
      return raw
    }
    let normalizedDigits: String
    if digits.count == 10 {
      normalizedDigits = "1" + digits
    } else {
      normalizedDigits = digits
    }
    guard normalizedDigits.count >= 11 else {
      return raw
    }
    let country = normalizedDigits.dropLast(10)
    let national = normalizedDigits.suffix(10)
    let area = national.prefix(3)
    let prefix = national.dropFirst(3).prefix(3)
    let line = national.suffix(4)
    return "+\(country) (\(area)) \(prefix)-\(line)"
  }

  var body: some View {
    HStack(spacing: 12) {
      ZStack {
        Circle()
          .fill(statusColor.opacity(0.2))
          .frame(width: 44, height: 44)
        Image(systemName: context.state.isTrusted ? "checkmark.shield.fill" : "phone.fill")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(statusColor)
      }

      VStack(alignment: .leading, spacing: 4) {
        Text(context.state.label)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Text(context.state.callerName)
          .font(.system(size: 17, weight: .bold))
          .lineLimit(1)
        if let callerNumber = formattedCallerNumber {
          Text(callerNumber)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      VStack(alignment: .trailing, spacing: 4) {
        Text(context.state.status)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(statusColor)
          .lineLimit(1)
        if let connectedAt {
          Text(timerInterval: connectedAt...Date(), countsDown: false)
            .font(.system(size: 16, weight: .bold, design: .rounded))
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
      }
      .frame(minWidth: 72, alignment: .trailing)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .activityBackgroundTint(.black.opacity(0.16))
    .activitySystemActionForegroundColor(.white)
  }
}

@available(iOSApplicationExtension 16.1, *)
struct VerityCallLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: VerityCallLiveActivityAttributes.self) { context in
      VerityCallLockScreenView(context: context)
        .widgetURL(URL(string: "verityprotect://calls"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: context.state.isTrusted ? "checkmark.shield.fill" : "phone.fill")
            .foregroundStyle(context.state.isTrusted ? .blue : .primary)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.label)
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(.secondary)
              .lineLimit(1)
            Text(context.state.callerName)
              .font(.system(size: 14, weight: .bold))
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.status)
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text("Tap to open calls")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let epoch = context.state.connectedAtEpochSeconds {
              Text(timerInterval: Date(timeIntervalSince1970: epoch)...Date(), countsDown: false)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .monospacedDigit()
            }
          }
        }
      } compactLeading: {
        Image(systemName: context.state.isTrusted ? "checkmark.shield.fill" : "phone.fill")
      } compactTrailing: {
        if let epoch = context.state.connectedAtEpochSeconds {
          Text(timerInterval: Date(timeIntervalSince1970: epoch)...Date(), countsDown: false)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .monospacedDigit()
        } else {
          Text(String(context.state.status.prefix(1)))
            .font(.system(size: 11, weight: .bold))
        }
      } minimal: {
        Image(systemName: context.state.isTrusted ? "checkmark.shield.fill" : "phone.fill")
      }
      .widgetURL(URL(string: "verityprotect://calls"))
    }
  }
}
#endif
