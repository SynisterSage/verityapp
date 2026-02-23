import Foundation
import PushKit
import CallKit
import React

@objc(VoIPPushModule)
class VoIPPushModule: RCTEventEmitter {

  private var pushRegistry: PKPushRegistry?
  private let callKitProvider: CXProvider
  private let callKitCallController: CXCallController
  private let callObserver: CXCallObserver
  private var latestVoIPToken: String?
  private var lastVoIPPushPayload: [String: Any]?
  private var pendingCallActions: [[String: String]] = []
  private var hasJsListeners = false
  private var nativeAutoAnswerDeadline: Date?
  private var nativeAutoAnswerExcludedCallUUID: UUID?
  private var nativeAutoAnswerWorkItem: DispatchWorkItem?

  override init() {
    // Use deprecated initializer for now - iOS 14+ alternative is complex
    // The deprecation warning is harmless and this works reliably
    let configuration = CXProviderConfiguration(localizedName: "Verity Protect")
    configuration.supportsVideo = false
    configuration.maximumCallsPerCallGroup = 1
    configuration.supportedHandleTypes = [.phoneNumber]

    self.callKitProvider = CXProvider(configuration: configuration)
    self.callKitCallController = CXCallController()
    self.callObserver = CXCallObserver()

    super.init()

    self.callKitProvider.setDelegate(self, queue: nil)
  }

  private func findPendingIncomingCall(excluding excludedUUID: UUID? = nil) -> CXCall? {
    let pendingCalls = callObserver.calls.filter { call in
      if call.hasEnded || call.hasConnected || call.isOutgoing {
        return false
      }
      if let excludedUUID, call.uuid == excludedUUID {
        return false
      }
      return true
    }
    return pendingCalls.last
  }

  private func requestAnswerCall(_ callUUID: UUID, completion: @escaping (Bool) -> Void) {
    let answerAction = CXAnswerCallAction(call: callUUID)
    let transaction = CXTransaction(action: answerAction)
    callKitCallController.request(transaction) { error in
      if let error {
        print("[VoIPPush] CallKit answer request failed: \(error.localizedDescription)")
        completion(false)
      } else {
        completion(true)
      }
    }
  }

  private func requestEndCall(_ callUUID: UUID) {
    let endCallAction = CXEndCallAction(call: callUUID)
    let transaction = CXTransaction(action: endCallAction)
    callKitCallController.request(transaction) { error in
      if let error {
        print("[VoIPPush] CallKit end request failed: \(error.localizedDescription)")
      } else {
        self.callKitProvider.reportCall(with: callUUID, endedAt: Date(), reason: .remoteEnded)
      }
    }
  }

  private func stopNativeAutoAnswer() {
    nativeAutoAnswerWorkItem?.cancel()
    nativeAutoAnswerWorkItem = nil
    nativeAutoAnswerDeadline = nil
    nativeAutoAnswerExcludedCallUUID = nil
  }

  private func scheduleNativeAutoAnswerRetry() {
    let workItem = DispatchWorkItem { [weak self] in
      self?.attemptNativeAutoAnswer()
    }
    nativeAutoAnswerWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: workItem)
  }

  private func attemptNativeAutoAnswer() {
    guard let deadline = nativeAutoAnswerDeadline else {
      return
    }
    if Date() > deadline {
      print("[VoIPPush] Native auto-answer window expired")
      stopNativeAutoAnswer()
      return
    }

    guard let targetCall = findPendingIncomingCall(excluding: nativeAutoAnswerExcludedCallUUID) else {
      scheduleNativeAutoAnswerRetry()
      return
    }

    requestAnswerCall(targetCall.uuid) { success in
      if success {
        let placeholderUUID = self.nativeAutoAnswerExcludedCallUUID
        print("[VoIPPush] Native auto-answer succeeded for call \(targetCall.uuid.uuidString)")
        self.stopNativeAutoAnswer()
        if let placeholderUUID {
          self.requestEndCall(placeholderUUID)
        }
        return
      }

      self.scheduleNativeAutoAnswerRetry()
    }
  }

  private func startNativeAutoAnswer(excluding excludedUUID: UUID) {
    nativeAutoAnswerExcludedCallUUID = excludedUUID
    nativeAutoAnswerDeadline = Date().addingTimeInterval(25)
    nativeAutoAnswerWorkItem?.cancel()
    nativeAutoAnswerWorkItem = nil
    print("[VoIPPush] Native auto-answer armed, waiting for Twilio call")
    attemptNativeAutoAnswer()
  }

  override static func moduleName() -> String! {
    return "VoIPPushModule"
  }

  override func supportedEvents() -> [String]! {
    return ["voipPushReceived", "voipTokenUpdated", "callAnswered", "callEnded"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func startObserving() {
    hasJsListeners = true
  }

  override func stopObserving() {
    hasJsListeners = false
  }

  @objc
  func registerForVoIPPushes() {
    DispatchQueue.main.async {
      if self.pushRegistry == nil {
        self.pushRegistry = PKPushRegistry(queue: DispatchQueue.main)
        self.pushRegistry?.delegate = self
        self.pushRegistry?.desiredPushTypes = [.voIP]
      } else {
        self.pushRegistry?.desiredPushTypes = [.voIP]
      }
    }
  }

  @objc
  func getCurrentVoIPToken(_ resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(latestVoIPToken ?? NSNull())
  }

  @objc
  func consumeLastVoIPPush(_ resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    if let payload = lastVoIPPushPayload {
      resolver(payload)
      lastVoIPPushPayload = nil
    } else {
      resolver(NSNull())
    }
  }

  @objc
  func consumePendingCallActions(_ resolver: @escaping RCTPromiseResolveBlock,
                                 rejecter: @escaping RCTPromiseRejectBlock) {
    resolver(pendingCallActions)
    pendingCallActions.removeAll()
  }

  @objc
  func answerLatestIncomingCall(_ excludeCallUUID: String?,
                                resolver: @escaping RCTPromiseResolveBlock,
                                rejecter: @escaping RCTPromiseRejectBlock) {
    let exclude = excludeCallUUID?.trimmingCharacters(in: .whitespacesAndNewlines)
    let excludedUUID = exclude.flatMap { UUID(uuidString: $0) }
    guard let targetCall = findPendingIncomingCall(excluding: excludedUUID) else {
      resolver(["success": false, "reason": "no_pending_call"])
      return
    }

    requestAnswerCall(targetCall.uuid) { success in
      if success {
        resolver(["success": true, "callUUID": targetCall.uuid.uuidString])
      } else {
        rejecter("CALLKIT_ERROR", "Failed to answer call", nil)
      }
    }
  }

  @objc
  func reportIncomingCall(_ callUUID: String,
                          callSid: String,
                          fromNumber: String,
                          toNumber: String,
                          resolver: @escaping RCTPromiseResolveBlock,
                          rejecter: @escaping RCTPromiseRejectBlock) {
    let uuid = UUID(uuidString: callUUID) ?? UUID()
    let handle = CXHandle(type: .phoneNumber, value: fromNumber)

    let update = CXCallUpdate()
    update.remoteHandle = handle
    update.hasVideo = false
    update.localizedCallerName = fromNumber

    callKitProvider.reportNewIncomingCall(with: uuid, update: update) { error in
      if let error = error {
        rejecter("CALLKIT_ERROR", "Failed to report incoming call: \(error.localizedDescription)", error)
      } else {
        resolver(["success": true, "callUUID": uuid.uuidString])
      }
    }
  }

  @objc
  func endCall(_ callUUID: String,
               resolver: @escaping RCTPromiseResolveBlock,
               rejecter: @escaping RCTPromiseRejectBlock) {
    guard let uuid = UUID(uuidString: callUUID) else {
      rejecter("INVALID_UUID", "Invalid call UUID", nil)
      return
    }

    let endCallAction = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: endCallAction)

    callKitCallController.request(transaction) { error in
      if let error = error {
        rejecter("CALLKIT_ERROR", "Failed to end call: \(error.localizedDescription)", error)
      } else {
        self.callKitProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        resolver(["success": true])
      }
    }
  }
}

// MARK: - PKPushRegistryDelegate
extension VoIPPushModule: PKPushRegistryDelegate {

  func pushRegistry(_ registry: PKPushRegistry,
                    didUpdate pushCredentials: PKPushCredentials,
                    for type: PKPushType) {
    guard type == .voIP else { return }

    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    latestVoIPToken = token
    print("[VoIPPush] Token updated: \(token)")

    sendEvent(withName: "voipTokenUpdated", body: ["token": token])
  }

  func pushRegistry(_ registry: PKPushRegistry,
                    didReceiveIncomingPushWith payload: PKPushPayload,
                    for type: PKPushType,
                    completion: @escaping () -> Void) {
    guard type == .voIP else {
      completion()
      return
    }

    print("[VoIPPush] Received VoIP push: \(payload.dictionaryPayload)")
    stopNativeAutoAnswer()

    // Log all keys to debug payload structure
    print("[VoIPPush] Payload keys: \(payload.dictionaryPayload.keys)")
    for (key, value) in payload.dictionaryPayload {
      print("[VoIPPush] Payload[\(key)] = \(value)")
    }

    let payloadDict = payload.dictionaryPayload
    guard payloadDict["call_sid"] != nil else {
      print("[VoIPPush] Ignoring non-custom VoIP push payload")
      completion()
      return
    }
    let callSid = payloadDict["call_sid"] as? String ?? ""
    let fromNumber = payloadDict["from_number"] as? String ?? "Unknown"
    let toNumber = payloadDict["to_number"] as? String ?? ""
    let callerName = (payloadDict["caller_name"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let callUUID = payloadDict["call_uuid"] as? String ?? UUID().uuidString
    let resolvedCallerName: String
    if let callerName, !callerName.isEmpty {
      resolvedCallerName = callerName
    } else {
      resolvedCallerName = fromNumber
    }

    print("[VoIPPush] Extracted: callSid=\(callSid) from=\(fromNumber) to=\(toNumber) callerName=\(resolvedCallerName) uuid=\(callUUID)")

    var persistedPayload: [String: Any] = [
      "callSid": callSid,
      "fromNumber": fromNumber,
      "toNumber": toNumber,
      "callUUID": callUUID
    ]
    if let callerName, !callerName.isEmpty {
      persistedPayload["callerName"] = callerName
    }
    lastVoIPPushPayload = persistedPayload

    // REQUIRED: iOS 13+ must report to CallKit immediately or future VoIP pushes are blocked
    // Create placeholder CallKit call, will be ended when Twilio's real call arrives
    let uuid = UUID(uuidString: callUUID) ?? UUID()
    let handle = CXHandle(type: .phoneNumber, value: fromNumber)
    let callUpdate = CXCallUpdate()
    callUpdate.remoteHandle = handle
    callUpdate.hasVideo = false
    callUpdate.localizedCallerName = resolvedCallerName

    print("[VoIPPush] Reporting placeholder call to CallKit: uuid=\(uuid)")
    callKitProvider.reportNewIncomingCall(with: uuid, update: callUpdate) { error in
      if let error = error {
        print("[VoIPPush] ERROR reporting call to CallKit: \(error.localizedDescription)")
        completion()
        return
      }

      print("[VoIPPush] Successfully reported placeholder call to CallKit")

      // Notify React Native - Twilio's real call will arrive in ~500ms
      // When it does, we'll end this placeholder call
      var eventBody: [String: Any] = [
        "callSid": callSid,
        "fromNumber": fromNumber,
        "toNumber": toNumber,
        "callUUID": uuid.uuidString
      ]
      if let callerName, !callerName.isEmpty {
        eventBody["callerName"] = callerName
      }
      self.sendEvent(withName: "voipPushReceived", body: eventBody)

      completion()
    }
  }

  func pushRegistry(_ registry: PKPushRegistry,
                    didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    latestVoIPToken = nil
    print("[VoIPPush] Token invalidated")
    // Never pass Swift nil through the event payload dictionary; bridge NSNull explicitly.
    sendEvent(withName: "voipTokenUpdated", body: ["token": NSNull()])
  }
}

// MARK: - CXProviderDelegate
extension VoIPPushModule: CXProviderDelegate {

  func providerDidReset(_ provider: CXProvider) {
    print("[VoIPPush] Provider reset")
    stopNativeAutoAnswer()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    print("[VoIPPush] User answered call")

    let payload = [
      "callUUID": action.callUUID.uuidString
    ]
    if hasJsListeners {
      sendEvent(withName: "callAnswered", body: payload)
    } else {
      pendingCallActions.append([
        "type": "callAnswered",
        "callUUID": action.callUUID.uuidString
      ])
    }

    startNativeAutoAnswer(excluding: action.callUUID)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    print("[VoIPPush] User ended call")
    if action.callUUID == nativeAutoAnswerExcludedCallUUID {
      stopNativeAutoAnswer()
    }

    let payload = [
      "callUUID": action.callUUID.uuidString
    ]
    if hasJsListeners {
      sendEvent(withName: "callEnded", body: payload)
    } else {
      pendingCallActions.append([
        "type": "callEnded",
        "callUUID": action.callUUID.uuidString
      ])
    }

    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    action.fulfill()
  }
}
