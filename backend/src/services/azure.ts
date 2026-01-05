import {
  AudioConfig,
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
}

export function transcribeWavBuffer(
  wavBuffer: Buffer,
  locale = 'en-US'
): Promise<TranscriptionResult> {
  const speechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
  speechConfig.speechRecognitionLanguage = locale;
  const audioConfig = AudioConfig.fromWavFileInput(wavBuffer);
  const recognizer = new SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      result => {
        recognizer.close();
        if (result.reason === ResultReason.RecognizedSpeech) {
          resolve({
            text: result.text,
            confidence: result.confidence,
          });
        } else {
          resolve({ text: '' });
        }
      },
      err => {
        recognizer.close();
        reject(err);
      }
    );
  });
}
