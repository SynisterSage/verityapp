import {
  AudioConfig,
  AutoDetectSourceLanguageConfig,
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
    recognizer.recognizeOnceAsync(
      result => {
        recognizer.close();
        if (result.reason === ResultReason.RecognizedSpeech) {
          let confidence: number | undefined;
          try {
            const json = result.properties.getProperty(PropertyId.SpeechServiceResponse_JsonResult);
            if (json) {
              const parsed = JSON.parse(json);
              const first = parsed?.NBest?.[0];
              if (first && typeof first.Confidence === 'number') {
                confidence = first.Confidence;
              }
            }
          } catch (err) {
            // Ignore parse errors; return transcript without confidence.
          }
          resolve({
            text: result.text,
            confidence,
            detectedLocale: null,
          });
        } else {
          resolve({ text: '', detectedLocale: null });
        }
      },
      err => {
        recognizer.close();
        reject(err);
      }
    );
  });
}
