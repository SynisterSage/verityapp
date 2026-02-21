import SwiftUI
import WidgetKit

private let appGroupIdentifier = "group.com.lexferguson.verityprotect.com"
private let needsAttentionKey = "alertsWidget.needsAttentionCount"
private let historyCountKey = "alertsWidget.historyCount"

struct AlertsWidgetEntry: TimelineEntry {
  let date: Date
  let needsAttentionCount: Int
  let historyCount: Int
}

struct AlertsWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> AlertsWidgetEntry {
    AlertsWidgetEntry(date: Date(), needsAttentionCount: 2, historyCount: 4)
  }

  func getSnapshot(in context: Context, completion: @escaping (AlertsWidgetEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<AlertsWidgetEntry>) -> Void) {
    let entry = loadEntry()
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func loadEntry() -> AlertsWidgetEntry {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      return AlertsWidgetEntry(date: Date(), needsAttentionCount: 0, historyCount: 0)
    }

    let needsAttention = max(0, defaults.integer(forKey: needsAttentionKey))
    let historyCount = max(0, defaults.integer(forKey: historyCountKey))

    return AlertsWidgetEntry(
      date: Date(),
      needsAttentionCount: needsAttention,
      historyCount: historyCount
    )
  }
}

struct VerityProtectAlertsWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme
  var entry: AlertsWidgetProvider.Entry

  var body: some View {
    Group {
      switch family {
      case .accessoryRectangular:
        alertsAccessoryRectangularView
      case .systemLarge:
        alertsSystemLargeView
      case .systemMedium:
        alertsSystemMediumView
      default:
        alertsSystemSmallView
      }
    }
    .widgetURL(URL(string: "verityprotect://alerts"))
  }

  private var alertsSystemSmallView: some View {
    VStack(alignment: .leading, spacing: 12) {
      widgetHeader(icon: "shield.lefthalf.filled", title: "Alerts", tint: .blue)
      metricRow(label: "Needs", value: entry.needsAttentionCount, tint: .blue)
      metricRow(label: "History", value: entry.historyCount, tint: .cyan)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(widgetBackground(accent: .blue, colorScheme: colorScheme))
  }

  private var alertsSystemMediumView: some View {
    VStack(alignment: .leading, spacing: 12) {
      widgetHeader(icon: "shield.lefthalf.filled", title: "Alerts", tint: .blue)
      HStack(spacing: 10) {
        metricCard(title: "Needs Attention", value: entry.needsAttentionCount, tint: .blue, colorScheme: colorScheme)
        metricCard(title: "History", value: entry.historyCount, tint: .cyan, colorScheme: colorScheme)
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(widgetBackground(accent: .blue, colorScheme: colorScheme))
  }

  private var alertsSystemLargeView: some View {
    VStack(alignment: .leading, spacing: 14) {
      widgetHeader(icon: "shield.lefthalf.filled", title: "Alerts", tint: .blue)

      heroMetricCard(
        title: "Needs Attention",
        value: entry.needsAttentionCount,
        suffix: "alerts",
        tint: .blue,
        colorScheme: colorScheme
      )

      HStack(spacing: 12) {
        metricCard(title: "History", value: entry.historyCount, tint: .cyan, colorScheme: colorScheme)
        statusCard(
          value: entry.needsAttentionCount > 0 ? "Needs Attention" : "All Clear",
          isAttention: entry.needsAttentionCount > 0,
          colorScheme: colorScheme
        )
        .frame(maxWidth: 132)
      }

      Spacer(minLength: 6)

      widgetFooterCTA()
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(widgetBackground(accent: .blue, colorScheme: colorScheme))
  }

  private var alertsAccessoryRectangularView: some View {
    HStack(spacing: 16) {
      compactMetric(label: "Need", value: entry.needsAttentionCount, tint: .blue)
      compactMetric(label: "Hist", value: entry.historyCount, tint: .cyan)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct VerityProtectHistoryWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme
  var entry: AlertsWidgetProvider.Entry

  var body: some View {
    Group {
      switch family {
      case .accessoryRectangular:
        historyAccessoryRectangularView
      case .systemLarge:
        historySystemLargeView
      case .systemMedium:
        historySystemMediumView
      default:
        historySystemSmallView
      }
    }
    .widgetURL(URL(string: "verityprotect://alerts"))
  }

  private var historySystemSmallView: some View {
    VStack(alignment: .leading, spacing: 12) {
      widgetHeader(icon: "clock.arrow.circlepath", title: "History", tint: .teal)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("\(entry.historyCount)")
          .font(.system(size: 34, weight: .bold))
          .foregroundStyle(entry.historyCount > 0 ? Color.teal : .primary)
          .monospacedDigit()
        Text("events")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(.secondary)
      }
      metricRow(label: "Needs", value: entry.needsAttentionCount, tint: .orange)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(widgetBackground(accent: .teal, colorScheme: colorScheme))
  }

  private var historySystemMediumView: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 12) {
        widgetHeader(icon: "clock.arrow.circlepath", title: "History", tint: .teal)
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text("\(entry.historyCount)")
            .font(.system(size: 38, weight: .bold))
            .foregroundStyle(entry.historyCount > 0 ? Color.teal : .primary)
            .monospacedDigit()
          Text("events")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.secondary)
        }
      }
      Spacer(minLength: 0)
      metricCard(title: "Needs Attention", value: entry.needsAttentionCount, tint: .orange, colorScheme: colorScheme)
        .frame(maxWidth: 132)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(widgetBackground(accent: .teal, colorScheme: colorScheme))
  }

  private var historySystemLargeView: some View {
    VStack(alignment: .leading, spacing: 14) {
      widgetHeader(icon: "clock.arrow.circlepath", title: "History", tint: .teal)

      heroMetricCard(
        title: "History",
        value: entry.historyCount,
        suffix: "events",
        tint: .teal,
        colorScheme: colorScheme
      )

      HStack(spacing: 12) {
        metricCard(title: "Needs Attention", value: entry.needsAttentionCount, tint: .orange, colorScheme: colorScheme)
        statusCard(
          value: entry.needsAttentionCount > 0 ? "Needs Attention" : "All Clear",
          isAttention: entry.needsAttentionCount > 0,
          colorScheme: colorScheme
        )
        .frame(maxWidth: 132)
      }

      Spacer(minLength: 6)

      widgetFooterCTA()
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(widgetBackground(accent: .teal, colorScheme: colorScheme))
  }

  private var historyAccessoryRectangularView: some View {
    HStack(spacing: 16) {
      compactMetric(label: "Events", value: entry.historyCount, tint: .teal)
      compactMetric(label: "Need", value: entry.needsAttentionCount, tint: .orange)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private func widgetHeader(icon: String, title: String, tint: Color) -> some View {
  HStack(spacing: 7) {
    Image(systemName: icon)
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(tint)
    Text(title)
      .font(.system(size: 15, weight: .semibold))
      .lineLimit(1)
      .minimumScaleFactor(0.9)
      .foregroundStyle(.primary)
    Spacer(minLength: 0)
  }
}

private func metricRow(label: String, value: Int, tint: Color) -> some View {
  HStack(spacing: 8) {
    Text(label)
      .font(.system(size: 12, weight: .semibold))
      .lineLimit(1)
      .minimumScaleFactor(0.85)
      .foregroundStyle(.secondary)
    Spacer(minLength: 8)
    Text("\(value)")
      .font(.system(size: 20, weight: .bold))
      .foregroundStyle(value > 0 ? tint : .primary)
      .monospacedDigit()
  }
}

private func metricCard(title: String, value: Int, tint: Color, colorScheme: ColorScheme) -> some View {
  VStack(alignment: .leading, spacing: 6) {
    Text(title)
      .font(.system(size: 12, weight: .semibold))
      .lineLimit(1)
      .minimumScaleFactor(0.78)
      .foregroundStyle(.secondary)
    Text("\(value)")
      .font(.system(size: 29, weight: .bold))
      .foregroundStyle(value > 0 ? tint : .primary)
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.8)
  }
  .frame(maxWidth: .infinity, alignment: .leading)
  .padding(.horizontal, 10)
  .padding(.vertical, 9)
  .background(
    RoundedRectangle(cornerRadius: 12, style: .continuous)
      .fill(Color.primary.opacity(colorScheme == .dark ? 0.18 : 0.08))
  )
}

private func heroMetricCard(
  title: String,
  value: Int,
  suffix: String,
  tint: Color,
  colorScheme: ColorScheme
) -> some View {
  VStack(alignment: .leading, spacing: 8) {
    Text(title)
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(.secondary)
      .lineLimit(1)
      .minimumScaleFactor(0.8)

    HStack(alignment: .firstTextBaseline, spacing: 7) {
      Text("\(value)")
        .font(.system(size: 50, weight: .bold))
        .foregroundStyle(value > 0 ? tint : .primary)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      Text(suffix)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
  .frame(maxWidth: .infinity, alignment: .leading)
  .padding(.horizontal, 14)
  .padding(.vertical, 12)
  .background(
    RoundedRectangle(cornerRadius: 14, style: .continuous)
      .fill(Color.primary.opacity(colorScheme == .dark ? 0.2 : 0.09))
  )
}

private func statusCard(value: String, isAttention: Bool, colorScheme: ColorScheme) -> some View {
  VStack(alignment: .leading, spacing: 6) {
    Text("Status")
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(.secondary)
      .lineLimit(1)
    Text(value)
      .font(.system(size: 16, weight: .bold))
      .foregroundStyle(isAttention ? Color.orange : Color.green)
      .lineLimit(2)
      .minimumScaleFactor(0.8)
  }
  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  .padding(.horizontal, 10)
  .padding(.vertical, 9)
  .background(
    RoundedRectangle(cornerRadius: 12, style: .continuous)
      .fill(Color.primary.opacity(colorScheme == .dark ? 0.18 : 0.08))
  )
}

private func widgetFooterCTA() -> some View {
  HStack(spacing: 6) {
    Image(systemName: "arrow.up.right")
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(.secondary)
    Text("Tap to open Alerts")
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(.secondary)
      .lineLimit(1)
  }
  .frame(maxWidth: .infinity, alignment: .leading)
}

private func compactMetric(label: String, value: Int, tint: Color) -> some View {
  VStack(alignment: .leading, spacing: 2) {
    Text(label)
      .font(.system(size: 10, weight: .semibold))
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .foregroundStyle(.secondary)
    Text("\(value)")
      .font(.system(size: 16, weight: .bold))
      .foregroundStyle(value > 0 ? tint : .primary)
      .monospacedDigit()
  }
}

@ViewBuilder
private func widgetBackground(accent: Color, colorScheme: ColorScheme) -> some View {
  let topColor = accent.opacity(colorScheme == .dark ? 0.28 : 0.15)
  let bottomColor = colorScheme == .dark ? Color.black.opacity(0.35) : Color.white.opacity(0.75)

  if #available(iOS 17.0, *) {
    Color.clear
      .containerBackground(for: .widget) {
        LinearGradient(
          colors: [topColor, bottomColor],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
  } else {
    LinearGradient(
      colors: [topColor, bottomColor],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

struct VerityProtectAlertsWidget: Widget {
  let kind: String = "VerityProtectAlertsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: AlertsWidgetProvider()) { entry in
      VerityProtectAlertsWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Verity Alerts")
    .description("Quick view of needs-attention and history alert counts.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
  }
}

struct VerityProtectHistoryWidget: Widget {
  let kind: String = "VerityProtectHistoryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: AlertsWidgetProvider()) { entry in
      VerityProtectHistoryWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Verity History")
    .description("History-focused snapshot with current needs-attention count.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
  }
}

@main
struct VerityProtectWidgetBundle: WidgetBundle {
  var body: some Widget {
    VerityProtectAlertsWidget()
    VerityProtectHistoryWidget()
  }
}
