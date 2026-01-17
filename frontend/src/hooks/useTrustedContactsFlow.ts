import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { authorizedFetch } from '../services/backend';
import { useProfile } from '../context/ProfileContext';
import { getAllContacts, selectContacts } from '../native/ContactPicker';

const relationshipTags = [
  'Wife',
  'Husband',
  'Son',
  'Daughter',
  'Grandchild',
  'Friend',
  'Caretaker',
  'Neighbor',
];

typing?EOF