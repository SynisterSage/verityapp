import Foundation
import React

#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(StoreKit)
import StoreKit
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

      // Keep only one active call card visible. If a stale call activity is still present
      // (e.g. previous ringing state), end it before starting the new one.
      let staleActivities = Activity<VerityCallLiveActivityAttributes>.activities.filter { activity in
        activity.attributes.callSid != callSid
      }
      for activity in staleActivities {
        await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
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

@objc(VeritySubscriptionsModule)
class VeritySubscriptionsModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func getProducts(
    _ productIds: NSArray,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(StoreKit)
    guard #available(iOS 15.0, *) else {
      resolver(["products": []])
      return
    }

    let ids = productIds
      .compactMap { $0 as? String }
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

    guard !ids.isEmpty else {
      resolver(["products": []])
      return
    }

    Task {
      do {
        var products = try await Product.products(for: Set(ids))
        if products.isEmpty {
          // Retry once after syncing with App Store in case product metadata just propagated.
          try? await AppStore.sync()
          products = try await Product.products(for: Set(ids))
        }

        guard !products.isEmpty else {
          let bundleId = Bundle.main.bundleIdentifier ?? "unknown-bundle"
          let message = "No App Store plans found for bundle \(bundleId) and product IDs: \(ids.joined(separator: ", "))"
          rejecter("STOREKIT_PRODUCTS_EMPTY", message, nil)
          return
        }

        let indexMap = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($1, $0) })
        let payload = products
          .map { product in mapProduct(product) }
          .sorted { left, right in
            let leftId = left["productId"] as? String ?? ""
            let rightId = right["productId"] as? String ?? ""
            return (indexMap[leftId] ?? Int.max) < (indexMap[rightId] ?? Int.max)
          }
        resolver(["products": payload])
      } catch {
        rejecter("STOREKIT_PRODUCTS_FAILED", error.localizedDescription, error)
      }
    }
#else
    resolver(["products": []])
#endif
  }

  @objc
  func purchaseProduct(
    _ productId: NSString,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(StoreKit)
    guard #available(iOS 15.0, *) else {
      resolver(["status": "failed", "message": "Unsupported iOS version"])
      return
    }

    let normalizedProductId = String(productId).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedProductId.isEmpty else {
      rejecter("STOREKIT_BAD_INPUT", "Missing productId", nil)
      return
    }

    Task {
      do {
        let products = try await Product.products(for: [normalizedProductId])
        guard let selectedProduct = products.first else {
          resolver([
            "status": "failed",
            "productId": normalizedProductId,
            "message": "Product not found",
          ])
          return
        }

        let purchaseResult = try await selectedProduct.purchase()
        switch purchaseResult {
        case .pending:
          resolver([
            "status": "pending",
            "productId": normalizedProductId,
            "message": "Purchase is pending approval",
          ])
        case .userCancelled:
          resolver([
            "status": "cancelled",
            "productId": normalizedProductId,
            "message": "Purchase canceled",
          ])
        case .success(let verificationResult):
          let transaction = try checkVerified(verificationResult)
          let receiptData = try await fetchReceiptData(syncIfMissing: true)
          let payload: [String: Any] = [
            "status": "purchased",
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "receiptData": receiptData,
          ]
          await transaction.finish()
          resolver(payload)
        @unknown default:
          resolver([
            "status": "failed",
            "productId": normalizedProductId,
            "message": "Unknown purchase state",
          ])
        }
      } catch {
        rejecter("STOREKIT_PURCHASE_FAILED", error.localizedDescription, error)
      }
    }
#else
    resolver(["status": "failed", "message": "StoreKit is unavailable"])
#endif
  }

  @objc
  func restorePurchases(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(StoreKit)
    guard #available(iOS 15.0, *) else {
      resolver(["status": "failed", "message": "Unsupported iOS version"])
      return
    }

    Task {
      do {
        try await AppStore.sync()
        let entitlements = try await loadCurrentEntitlements()
        let receiptData = try? await fetchReceiptData(syncIfMissing: false)
        let activeEntitlement = entitlements.first { ($0["isActive"] as? Bool) == true }
        guard let activeEntitlement else {
          resolver([
            "status": "failed",
            "message": "No active subscription found",
            "receiptData": receiptData as Any,
          ])
          return
        }
        resolver([
          "status": "purchased",
          "productId": activeEntitlement["productId"] as? String as Any,
          "transactionId": activeEntitlement["transactionId"] as? String as Any,
          "originalTransactionId": activeEntitlement["originalTransactionId"] as? String as Any,
          "receiptData": receiptData as Any,
        ])
      } catch {
        rejecter("STOREKIT_RESTORE_FAILED", error.localizedDescription, error)
      }
    }
#else
    resolver(["status": "failed", "message": "StoreKit is unavailable"])
#endif
  }

  @objc
  func getCurrentEntitlements(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(StoreKit)
    guard #available(iOS 15.0, *) else {
      resolver(["entitlements": []])
      return
    }

    Task {
      do {
        let entitlements = try await loadCurrentEntitlements()
        let receiptData = try? await fetchReceiptData(syncIfMissing: false)
        resolver([
          "entitlements": entitlements,
          "receiptData": receiptData as Any,
        ])
      } catch {
        rejecter("STOREKIT_ENTITLEMENTS_FAILED", error.localizedDescription, error)
      }
    }
#else
    resolver(["entitlements": []])
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

#if canImport(StoreKit)
@available(iOS 15.0, *)
private func mapProduct(_ product: Product) -> [String: Any] {
  let subscriptionPeriodUnit = product.subscription?.subscriptionPeriod.unit
  let periodUnit: String?
  switch subscriptionPeriodUnit {
  case .day:
    periodUnit = "day"
  case .week:
    periodUnit = "week"
  case .month:
    periodUnit = "month"
  case .year:
    periodUnit = "year"
  default:
    periodUnit = nil
  }

  return [
    "productId": product.id,
    "displayName": product.displayName,
    "description": product.description,
    "displayPrice": product.displayPrice,
    "price": NSDecimalNumber(decimal: product.price),
    "currencyCode": product.priceFormatStyle.currencyCode,
    "subscriptionPeriodUnit": periodUnit as Any,
    "subscriptionPeriodCount": product.subscription?.subscriptionPeriod.value as Any,
  ]
}

@available(iOS 15.0, *)
private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
  switch result {
  case .verified(let signedType):
    return signedType
  case .unverified(_, let verificationError):
    throw verificationError
  }
}

private func isoTimestamp(_ date: Date?) -> String? {
  guard let date else {
    return nil
  }
  return ISO8601DateFormatter().string(from: date)
}

@available(iOS 15.0, *)
private func loadCurrentEntitlements() async throws -> [[String: Any]] {
  var entitlements: [[String: Any]] = []
  for await result in Transaction.currentEntitlements {
    guard let transaction = try? checkVerified(result) else {
      continue
    }
    let isActive = transaction.revocationDate == nil && (
      transaction.expirationDate == nil || transaction.expirationDate! > Date()
    )
    entitlements.append([
      "productId": transaction.productID,
      "transactionId": String(transaction.id),
      "originalTransactionId": String(transaction.originalID),
      "purchasedAt": isoTimestamp(transaction.purchaseDate) as Any,
      "expiresAt": isoTimestamp(transaction.expirationDate) as Any,
      "revokedAt": isoTimestamp(transaction.revocationDate) as Any,
      "isActive": isActive,
    ])
  }
  return entitlements
}

@available(iOS 15.0, *)
private func fetchReceiptData(syncIfMissing: Bool) async throws -> String {
  if let base64 = readReceiptData() {
    return base64
  }

  if syncIfMissing {
    try await AppStore.sync()
    if let base64 = readReceiptData() {
      return base64
    }
  }

  throw NSError(
    domain: "VeritySubscriptionsModule",
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: "App receipt not available"]
  )
}

private func readReceiptData() -> String? {
  guard let receiptURL = Bundle.main.appStoreReceiptURL else {
    return nil
  }
  guard FileManager.default.fileExists(atPath: receiptURL.path) else {
    return nil
  }
  guard let data = try? Data(contentsOf: receiptURL), !data.isEmpty else {
    return nil
  }
  return data.base64EncodedString()
}
#endif
