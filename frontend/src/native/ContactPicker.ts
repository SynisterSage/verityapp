import { NativeModules } from 'react-native';

export type NativeContact = {
  id: string;
  name: string;
  numbers: string[];
};

type ContactPickerModule = {
  selectContacts: () => Promise<NativeContact[]>;
  getAllContacts: () => Promise<NativeContact[]>;
};

const ContactPicker = NativeModules.ContactPicker as ContactPickerModule | undefined;

function ensureModule() {
  if (!ContactPicker) {
    throw new Error('Native ContactPicker module is not available.');
  }
  return ContactPicker;
}

export async function selectContacts() {
  return ensureModule().selectContacts();
}

export async function getAllContacts() {
  return ensureModule().getAllContacts();
}
