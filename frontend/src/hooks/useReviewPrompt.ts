/**
 * useReviewPrompt — "Enjoying SafeCall?" native review prompt
 *
 * Strategy:
 *  - Track meaningful actions: each screened call viewed + each trusted contact added
 *  - Gate: ≥5 days since first launch, ≥3 meaningful actions, ≥60 days between prompts,
 *           ≤3 prompts ever (Apple throttles to 3/year anyway)
 *  - Spreads prompts out — never spams the user
 */
import { useCallback } from 'react';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  firstLaunch: '@review/firstLaunchDate',
  actionCount: '@review/meaningfulActionCount',
  lastPrompt: '@review/lastPromptDate',
  promptCount: '@review/promptCount',
};

const MIN_DAYS_SINCE_INSTALL = 5;
const MIN_ACTIONS = 3;
const MIN_DAYS_BETWEEN_PROMPTS = 60;
const MAX_PROMPTS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function daysSince(isoDate: string): Promise<number> {
  return (Date.now() - new Date(isoDate).getTime()) / MS_PER_DAY;
}

async function maybeRequestReview(): Promise<void> {
  try {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    // Record first launch if not set
    let firstLaunch = await AsyncStorage.getItem(KEYS.firstLaunch);
    if (!firstLaunch) {
      await AsyncStorage.setItem(KEYS.firstLaunch, nowISO);
      firstLaunch = nowISO;
    }

    // Check all gates
    const daysSinceInstall = await daysSince(firstLaunch);
    if (daysSinceInstall < MIN_DAYS_SINCE_INSTALL) return;

    const actionCount = parseInt((await AsyncStorage.getItem(KEYS.actionCount)) ?? '0', 10);
    if (actionCount < MIN_ACTIONS) return;

    const promptCount = parseInt((await AsyncStorage.getItem(KEYS.promptCount)) ?? '0', 10);
    if (promptCount >= MAX_PROMPTS) return;

    const lastPrompt = await AsyncStorage.getItem(KEYS.lastPrompt);
    if (lastPrompt) {
      const daysSinceLast = await daysSince(lastPrompt);
      if (daysSinceLast < MIN_DAYS_BETWEEN_PROMPTS) return;
    }

    // All gates passed — request review
    await AsyncStorage.setItem(KEYS.lastPrompt, nowISO);
    await AsyncStorage.setItem(KEYS.promptCount, String(promptCount + 1));
    await StoreReview.requestReview();
  } catch {
    // Never crash the app over a review prompt
  }
}

async function recordAction(): Promise<void> {
  try {
    const current = parseInt((await AsyncStorage.getItem(KEYS.actionCount)) ?? '0', 10);
    await AsyncStorage.setItem(KEYS.actionCount, String(current + 1));
  } catch {
    // ignore
  }
}

/**
 * Call `recordMeaningfulAction()` at any positive user moment.
 * It increments the counter and, once all gates are cleared, fires
 * the native App Store review prompt.
 */
export function useReviewPrompt() {
  // Initialise first-launch timestamp on first hook mount (idempotent)
  const recordMeaningfulAction = useCallback(async () => {
    await recordAction();
    await maybeRequestReview();
  }, []);

  return { recordMeaningfulAction };
}

/**
 * Call once on app start to stamp the first-launch date.
 * Safe to call multiple times — only writes if the key is absent.
 */
export async function initReviewPrompt(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(KEYS.firstLaunch);
    if (!existing) {
      await AsyncStorage.setItem(KEYS.firstLaunch, new Date().toISOString());
    }
  } catch {
    // ignore
  }
}
