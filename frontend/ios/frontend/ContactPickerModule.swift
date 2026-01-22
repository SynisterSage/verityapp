import Contacts
import ContactsUI
import UIKit
import React

@objc(ContactPicker)
class ContactPicker: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    "ContactPicker"
  }

  static func requiresMainQueueSetup() -> Bool {
    true
  }

  private let contactStore = CNContactStore()
  private var selectContactsResolver: RCTPromiseResolveBlock?
  private var selectContactsRejecter: RCTPromiseRejectBlock?

  @objc func selectContacts(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    requestContactsAccess { [weak self] granted in
      guard granted else {
        rejecter("E_CONTACTS_PERMISSION", "Contacts access denied", nil)
        return
      }
      DispatchQueue.main.async {
        guard let self = self else { return }
        guard self.selectContactsResolver == nil else {
          rejecter("E_CONTACTS_BUSY", "Contact picker already in use", nil)
          return
        }
        guard let presenter = self.topViewController() else {
          rejecter("E_CONTEXT", "Unable to present contact picker", nil)
          return
        }
        let picker = CNContactPickerViewController()
        picker.delegate = self
        picker.displayedPropertyKeys = [
          CNContactGivenNameKey as CNKeyDescriptor,
          CNContactFamilyNameKey as CNKeyDescriptor,
          CNContactPhoneNumbersKey as CNKeyDescriptor,
        ]
        picker.modalPresentationStyle = .formSheet
        self.selectContactsResolver = resolve
        self.selectContactsRejecter = rejecter
        presenter.present(picker, animated: true, completion: nil)
      }
    }
  }

  @objc func getAllContacts(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    requestContactsAccess { [weak self] granted in
      guard let self = self else { return }
      guard granted else {
        rejecter("E_CONTACTS_PERMISSION", "Contacts access denied", nil)
        return
      }
      do {
        let contacts = try self.fetchAllContacts()
        resolve(contacts.map { self.serializeContact($0) })
      } catch {
        rejecter("E_CONTACTS_FETCH", "Unable to load contacts", error)
      }
    }
  }

  private func requestContactsAccess(_ completion: @escaping (Bool) -> Void) {
    let status = CNContactStore.authorizationStatus(for: .contacts)
    if status == .authorized {
      completion(true)
      return
    }
    contactStore.requestAccess(for: .contacts) { granted, _ in
      DispatchQueue.main.async {
        completion(granted)
      }
    }
  }

  private func fetchAllContacts() throws -> [CNContact] {
    let keys: [CNKeyDescriptor] = [
      CNContactIdentifierKey as CNKeyDescriptor,
      CNContactGivenNameKey as CNKeyDescriptor,
      CNContactFamilyNameKey as CNKeyDescriptor,
      CNContactMiddleNameKey as CNKeyDescriptor,
      CNContactNicknameKey as CNKeyDescriptor,
      CNContactPhoneNumbersKey as CNKeyDescriptor,
    ]
    var contacts: [CNContact] = []
    let containers = try contactStore.containers(matching: nil)
    for container in containers {
      let predicate = CNContact.predicateForContactsInContainer(withIdentifier: container.identifier)
      let items = try contactStore.unifiedContacts(matching: predicate, keysToFetch: keys)
      contacts.append(contentsOf: items)
    }
    return contacts
  }

  private func serializeContact(_ contact: CNContact) -> [String: Any] {
    let nameParts = [contact.givenName, contact.familyName].filter { !$0.isEmpty }
    let name = nameParts.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    let fallbackName = contact.nickname
    let finalName = name.isEmpty ? (fallbackName.isEmpty ? "Unknown" : fallbackName) : name
    let numbers = contact.phoneNumbers.map { $0.value.stringValue }
    return [
      "id": contact.identifier,
      "name": finalName,
      "numbers": numbers,
    ]
  }

  private func topViewController() -> UIViewController? {
    if #available(iOS 13, *) {
      return UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }
        .flatMap { self.findTopController(from: $0.rootViewController) }
    }
    return self.findTopController(from: UIApplication.shared.keyWindow?.rootViewController)
  }

  private func findTopController(from controller: UIViewController?) -> UIViewController? {
    if let presented = controller?.presentedViewController {
      return findTopController(from: presented)
    }
    return controller
  }
}

extension ContactPicker: CNContactPickerDelegate {
  func contactPicker(_ picker: CNContactPickerViewController, didSelect contacts: [CNContact]) {
    let results = contacts.map { serializeContact($0) }
    selectContactsResolver?(results)
    cleanupPickerState()
  }

  func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
    selectContactsResolver?([])
    cleanupPickerState()
  }

  private func cleanupPickerState() {
    selectContactsResolver = nil
    selectContactsRejecter = nil
  }
}
