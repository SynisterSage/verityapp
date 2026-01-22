package com.anonymous.frontend

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.ActivityEventListener
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

@ReactModule(name = ContactPickerModule.NAME)
class ContactPickerModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener, PermissionListener {

  companion object {
    const val NAME = "ContactPicker"
    private const val PERMISSIONS_REQUEST_CODE = 0x4312
    private const val CONTACT_PICKER_REQUEST_CODE = 0x4313
  }

  private enum class PendingAction {
    SELECT,
    LIST
  }

  private var pendingAction: PendingAction? = null
  private var pendingPermissionPromise: Promise? = null
  private var selectContactsPromise: Promise? = null

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    reactContext.addActivityEventListener(this)
  }

  override fun onCatalystInstanceDestroy() {
    reactContext.removeActivityEventListener(this)
    super.onCatalystInstanceDestroy()
  }

  override fun selectContacts(promise: Promise) {
    performAction(PendingAction.SELECT, promise)
  }

  override fun getAllContacts(promise: Promise) {
    performAction(PendingAction.LIST, promise)
  }

  private fun performAction(action: PendingAction, promise: Promise, skipPermissionCheck: Boolean = false) {
    if (!skipPermissionCheck && !hasContactsPermission()) {
      requestContactsPermission(action, promise)
      return
    }
    when (action) {
      PendingAction.SELECT -> startContactPicker(promise)
      PendingAction.LIST -> resolveAllContacts(promise)
    }
  }

  private fun hasContactsPermission(): Boolean {
    return ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.READ_CONTACTS
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun requestContactsPermission(action: PendingAction, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Unable to request contacts permission")
      return
    }
    pendingAction = action
    pendingPermissionPromise = promise
    if (activity is PermissionAwareActivity) {
      activity.requestPermissions(
        arrayOf(Manifest.permission.READ_CONTACTS),
        PERMISSIONS_REQUEST_CODE,
        this
      )
    } else {
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.READ_CONTACTS),
        PERMISSIONS_REQUEST_CODE
      )
    }
  }

  private fun startContactPicker(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Unable to launch contact picker")
      return
    }
    if (selectContactsPromise != null) {
      promise.reject("E_CONTACTS_BUSY", "Contact picker already running")
      return
    }
    selectContactsPromise = promise
    val intent = Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI).apply {
      type = ContactsContract.CommonDataKinds.Phone.CONTENT_TYPE
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    activity.startActivityForResult(intent, CONTACT_PICKER_REQUEST_CODE)
  }

  private fun resolveAllContacts(promise: Promise) {
    try {
      val resolver = reactContext.contentResolver
      val projection = arrayOf(
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER
      )
      val cursor = resolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        projection,
        null,
        null,
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
      )
      val contacts = cursor?.use {
        val idIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
        val nameIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        val map = linkedMapOf<String, Pair<String, MutableSet<String>>>()
        while (it.moveToNext()) {
          val id = it.getString(idIndex) ?: continue
          val name = it.getString(nameIndex) ?: ""
          val number = it.getString(numberIndex) ?: continue
          val entry = map.getOrPut(id) { name to linkedSetOf() }
          entry.second.add(number)
        }
        WritableNativeArray().apply {
          map.forEach { (id, pair) ->
            val contactMap = WritableNativeMap()
            contactMap.putString("id", id)
            contactMap.putString("name", pair.first)
            val numbers = WritableNativeArray()
            pair.second.forEach { numbers.pushString(it) }
            contactMap.putArray("numbers", numbers)
            pushMap(contactMap)
          }
        }
      } ?: WritableNativeArray()
      promise.resolve(contacts)
    } catch (error: Exception) {
      promise.reject("E_CONTACTS_FETCH", "Failed to load contacts", error)
    }
  }

  private fun addContactFromUri(uri: Uri, map: MutableMap<String, WritableNativeMap>) {
    val resolver = reactContext.contentResolver
    val projection = arrayOf(
      ContactsContract.Contacts._ID,
      ContactsContract.Contacts.DISPLAY_NAME
    )
    resolver.query(uri, projection, null, null, null)?.use { cursor ->
      if (!cursor.moveToFirst()) return
      val idIndex = cursor.getColumnIndex(ContactsContract.Contacts._ID)
      val nameIndex = cursor.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME)
      val id = cursor.getString(idIndex) ?: return
      val name = cursor.getString(nameIndex) ?: ""
      val numbers = fetchNumbersForContact(id)
      if (numbers.isEmpty()) return
      val contactMap = WritableNativeMap()
      contactMap.putString("id", id)
      contactMap.putString("name", name)
      val numbersArray = WritableNativeArray()
      numbers.forEach { numbersArray.pushString(it) }
      contactMap.putArray("numbers", numbersArray)
      map[id] = contactMap
    }
  }

  private fun fetchNumbersForContact(contactId: String): Set<String> {
    val resolver = reactContext.contentResolver

    val cursor = resolver.query(
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
      arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
      "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
      arrayOf(contactId),
      null
    )
    val numbers = mutableSetOf<String>()
    cursor?.use {
      val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
      while (it.moveToNext()) {
        val number = it.getString(numberIndex) ?: continue
        if (number.isNotBlank()) {
          numbers.add(number)
        }
      }
    }
    return numbers
  }

  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != CONTACT_PICKER_REQUEST_CODE) {
      return
    }
    val promise = selectContactsPromise ?: return
    selectContactsPromise = null
    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.resolve(WritableNativeArray())
      return
    }
    val collectedContacts = linkedMapOf<String, WritableNativeMap>()
    data.clipData?.let { clip ->
      for (index in 0 until clip.itemCount) {
        clip.getItemAt(index).uri?.let { addContactFromUri(it, collectedContacts) }
      }
    }
    data.data?.let { addContactFromUri(it, collectedContacts) }
    val result = WritableNativeArray()
    collectedContacts.values.forEach { result.pushMap(it) }
    promise.resolve(result)
  }

  override fun onNewIntent(intent: Intent?) {
    // No-op
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != PERMISSIONS_REQUEST_CODE) {
      return false
    }
    val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
    val action = pendingAction
    val promise = pendingPermissionPromise
    pendingAction = null
    pendingPermissionPromise = null
    if (!granted) {
      promise?.reject("E_CONTACTS_PERMISSION", "Contacts permission denied")
      return true
    }
    if (action != null && promise != null) {
      performAction(action, promise, skipPermissionCheck = true)
    }
    return true
  }
}
