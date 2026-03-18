import React from 'react';

const GLOBAL_MAX_FONT_SIZE_MULTIPLIER = 1.2;
const PATCH_FLAG = '__safecall_global_text_scaling_patch__';

type AnyRecord = Record<string, unknown>;

const STATIC_KEYS_TO_SKIP = new Set([
  'length',
  'name',
  'prototype',
  'displayName',
  'defaultProps',
  'propTypes',
]);

function hoistStaticProperties(target: AnyRecord, source: AnyRecord) {
  const names = Object.getOwnPropertyNames(source);
  for (const name of names) {
    if (STATIC_KEYS_TO_SKIP.has(name)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (!descriptor) {
      continue;
    }
    try {
      Object.defineProperty(target, name, descriptor);
    } catch {
      // Ignore non-configurable properties.
    }
  }
}

function replaceModuleExport(moduleExports: AnyRecord, key: string, replacement: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(moduleExports, key);
  if (!descriptor) {
    moduleExports[key] = replacement;
    return true;
  }

  if (descriptor.writable || descriptor.set) {
    moduleExports[key] = replacement;
    return true;
  }

  if (descriptor.configurable) {
    Object.defineProperty(moduleExports, key, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable ?? true,
      writable: true,
      value: replacement,
    });
    return true;
  }

  return false;
}

function installGlobalTextScaling() {
  if ((globalThis as AnyRecord)[PATCH_FLAG]) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const reactNative = require('react-native') as AnyRecord;
  const OriginalText = reactNative.Text as React.ComponentType<AnyRecord> | undefined;
  const OriginalTextInput = reactNative.TextInput as React.ComponentType<AnyRecord> | undefined;

  if (!OriginalText || !OriginalTextInput) {
    return;
  }

  const PatchedText = React.forwardRef<unknown, AnyRecord>((props, ref) => {
    const { allowFontScaling, maxFontSizeMultiplier, ...rest } = props ?? {};
    return React.createElement(OriginalText, {
      ...rest,
      ref,
      allowFontScaling: allowFontScaling ?? true,
      maxFontSizeMultiplier: maxFontSizeMultiplier ?? GLOBAL_MAX_FONT_SIZE_MULTIPLIER,
    });
  }) as unknown as AnyRecord;
  PatchedText.displayName = 'SafeCallText';
  hoistStaticProperties(PatchedText, OriginalText as unknown as AnyRecord);

  const PatchedTextInput = React.forwardRef<unknown, AnyRecord>((props, ref) => {
    const { allowFontScaling, maxFontSizeMultiplier, ...rest } = props ?? {};
    return React.createElement(OriginalTextInput, {
      ...rest,
      ref,
      allowFontScaling: allowFontScaling ?? true,
      maxFontSizeMultiplier: maxFontSizeMultiplier ?? GLOBAL_MAX_FONT_SIZE_MULTIPLIER,
    });
  }) as unknown as AnyRecord;
  PatchedTextInput.displayName = 'SafeCallTextInput';
  hoistStaticProperties(PatchedTextInput, OriginalTextInput as unknown as AnyRecord);

  const textPatched = replaceModuleExport(reactNative, 'Text', PatchedText);
  const inputPatched = replaceModuleExport(reactNative, 'TextInput', PatchedTextInput);

  if (textPatched && inputPatched) {
    (globalThis as AnyRecord)[PATCH_FLAG] = true;
  }
}

installGlobalTextScaling();
