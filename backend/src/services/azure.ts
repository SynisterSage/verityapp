import {
  AudioConfig,
  CancellationReason,
  OutputFormat,
  PropertyId,
  ResultReason,
  SpeechConfig,
  SpeechRecognizer,
} from 'microsoft-cognitiveservices-speech-sdk';

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY ?? '';
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION ?? '';

if (!SPEECH_KEY || !SPEECH_REGION) {
  throw new Error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION');
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  detectedLocale?: string | null;
}

export function transcribeWavBuffer(
  wavBuffer: Buffer,
  locale = 'en-US'
): Promise<TranscriptionResult> {
  const speechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
  speechConfig.outputFormat = OutputFormat.Detailed;
  speechConfig.speechRecognitionLanguage = locale;
  const audioConfig = AudioConfig.fromWavFileInput(wavBuffer);
  const recognizer = new SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    const segments: string[] = [];
    let bestConfidence: number | undefined;
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      recognizer.close();
      resolve({
        text: segments.join(' ').trim(),
        confidence: bestConfidence,
        detectedLocale: null,
      });
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      recognizer.close();
      reject(error);
    };

    recognizer.recognized = (_sender, event: any) => {
      if (event.result.reason !== ResultReason.RecognizedSpeech) {
        return;
      }
      const trimmed = event.result.text?.trim();
      if (trimmed) {
        segments.push(trimmed);
      }
      try {
        const json = event.result.properties.getProperty(PropertyId.SpeechServiceResponse_JsonResult);
        if (json) {
          const parsed = JSON.parse(json);
          const first = parsed?.NBest?.[0];
          if (first && typeof first.Confidence === 'number') {
            bestConfidence = Math.max(bestConfidence ?? 0, first.Confidence);
          }
        }
      } catch (err) {
        // Ignore parse errors; allow returning text without confidence.
      }
    };

    recognizer.sessionStopped = () => {
      finalize();
    };

    recognizer.canceled = (_sender, event: any) => {
      if (event.reason === CancellationReason.EndOfStream) {
        finalize();
        return;
      }
      fail(new Error(event.errorDetails ?? 'Azure speech recognition canceled'));
    };

    recognizer.startContinuousRecognitionAsync(
      () => undefined,
      (err) => {
        if (err && typeof err === 'object' && 'message' in err) {
          fail(err as Error);
          return;
        }
        fail(
          new Error(
            String(err ?? 'Azure speech recognition failed to start')
          )
        );
      }
    );
  });
}
