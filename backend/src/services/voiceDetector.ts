import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import logger from 'jet-logger';

export type VoiceAnalysisResult = {
  /** Aggregated score (median fake probability over chunks). */
  score: number;
  /** The binary classifier fake probability (per chunk average). */
  fakeProbability: number;
  /** The binary classifier real probability (per chunk average). */
  realProbability: number;
  /** The raw detector output (stdout) for debugging. */
  rawOutput: string;
  /** Number of chunks that were scored. */
  chunkCount: number;
  /** Median fake probability across chunks. */
  chunkMedianFake?: number | null;
  /** Max fake probability across chunks. */
  chunkMaxFake?: number | null;
  /** Fake probabilities per chunk. */
  chunkFakeScores: number[];
  /** Real probabilities per chunk. */
  chunkRealScores: number[];
  /** Number of chunks above the high threshold. */
  highChunkCount?: number | null;
  /** Ratio of high chunks to total chunks. */
  highChunkRatio?: number | null;
  /** Alert band derived from the aggregated chunk stats. */
  alertBand?: 'none' | 'caution' | 'high';
  /** Average fake probability across all chunks. */
  binaryAverageFake?: number | null;
};

const DETECTOR_ROOT = process.env.VOICE_DETECTOR_PATH
  ? path.resolve(process.env.VOICE_DETECTOR_PATH)
  : path.resolve(__dirname, '../voice-detector');
const DETECTOR_MODEL_PATH =
  process.env.VOICE_DETECTOR_MODEL_PATH ??
  path.join(DETECTOR_ROOT, 'model.pth');
const DETECTOR_SCRIPT = path.join(DETECTOR_ROOT, 'eval.py');
const PYTHON_BIN = process.env.VOICE_DETECTOR_PYTHON ?? 'python3';
const ENABLED = process.env.VOICE_DETECTOR_ENABLED !== 'false';

let detectorReady: boolean | null = null;

async function checkDetectorAvailability(): Promise<boolean> {
  if (!ENABLED) {
    detectorReady = false;
    return false;
  }
  if (detectorReady !== null) {
    return detectorReady;
  }
  try {
    await fs.access(DETECTOR_SCRIPT);
    await fs.access(DETECTOR_MODEL_PATH);
    detectorReady = true;
  } catch (err) {
    detectorReady = false;
    logger.warn(
      `Synthetic voice detector unavailable (missing script/model) @ ${DETECTOR_ROOT}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return detectorReady;
}

function parseDetectorOutput(stdout: string): VoiceAnalysisResult | null {
  const binaryMatch = stdout.match(
    /Binary classification result\s*:\s*fake:([0-9.]+)\s*,\s*real:([0-9.]+)/i
  );
  if (!binaryMatch) {
    return null;
  }
  const aggregatedMatch = stdout.match(/AGGREGATED_RESULT:\s*(\{[\s\S]*\})/i);
  let aggregated: Record<string, any> | null = null;
  if (aggregatedMatch) {
    try {
      aggregated = JSON.parse(aggregatedMatch[1]);
    } catch {
      aggregated = null;
    }
  }
  const fakeProbability = Number(binaryMatch[1]);
  const realProbability = Number(binaryMatch[2]);
  if (Number.isNaN(fakeProbability) || Number.isNaN(realProbability)) {
    return null;
  }
  const chunkFakeScores = Array.isArray(aggregated?.fake_scores)
    ? aggregated.fake_scores.map((value: unknown) => Number(value)).filter((value) => !Number.isNaN(value))
    : [];
  const chunkRealScores = Array.isArray(aggregated?.real_scores)
    ? aggregated.real_scores.map((value: unknown) => Number(value)).filter((value) => !Number.isNaN(value))
    : [];
  const chunkMedianFake = typeof aggregated?.median_fake === 'number' ? aggregated.median_fake : null;
  const chunkMaxFake = typeof aggregated?.max_fake === 'number' ? aggregated.max_fake : null;
  const chunkCount =
    typeof aggregated?.chunk_count === 'number'
      ? aggregated.chunk_count
      : Math.max(chunkFakeScores.length, chunkRealScores.length);
  const highChunkCount =
    typeof aggregated?.high_chunk_count === 'number' ? aggregated.high_chunk_count : null;
  const highChunkRatio =
    typeof aggregated?.high_chunk_ratio === 'number' ? aggregated.high_chunk_ratio : null;
  const alertBand = (aggregated?.alert_band as 'none' | 'caution' | 'high') ?? 'none';
  const binaryAverageFake =
    typeof aggregated?.binary_average_fake === 'number'
      ? aggregated.binary_average_fake
      : fakeProbability;
  const score = chunkMedianFake ?? fakeProbability;
  return {
    score,
    fakeProbability,
    realProbability,
    rawOutput: stdout.trim(),
    chunkCount,
    chunkMedianFake,
    chunkMaxFake,
    chunkFakeScores,
    chunkRealScores,
    highChunkCount,
    highChunkRatio,
    alertBand,
    binaryAverageFake,
  };
}

async function runDetector(inputPath: string): Promise<VoiceAnalysisResult | null> {
  const args = [
    DETECTOR_SCRIPT,
    '--input_path',
    inputPath,
    '--model_path',
    DETECTOR_MODEL_PATH,
  ];

  return new Promise<VoiceAnalysisResult | null>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd: DETECTOR_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      if (code !== 0) {
        reject(
          new Error(
            `Synthetic voice detector exited with code ${code}: ${
              stderr || stdout || 'no output'
            }`
          )
        );
        return;
      }
      const parsed = parseDetectorOutput(stdout);
      if (parsed) {
        resolve(parsed);
        return;
      }
      reject(
        new Error(
          `Unable to parse synthetic voice detector output (${stdout.trim()})`
        )
      );
    });
  });
}

interface TempPath {
  filePath: string;
  dirPath: string;
}

async function writeTempFile(buffer: Buffer): Promise<TempPath> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-detector-'));
  const filename = path.join(
    tempDir,
    `recording-${Date.now()}-${randomBytes(4).toString('hex')}.wav`
  );
  await fs.writeFile(filename, buffer);
  return { filePath: filename, dirPath: tempDir };
}

async function cleanupTempPath(tempPath: TempPath) {
  try {
    await fs.unlink(tempPath.filePath);
  } catch {
    // best effort
  }
  try {
    await fs.rm(tempPath.dirPath, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

export async function detectSyntheticVoice(
  buffer: Buffer
): Promise<VoiceAnalysisResult | null> {
  const ready = await checkDetectorAvailability();
  if (!ready) {
    return null;
  }

  const tempPath = await writeTempFile(buffer);
  try {
    return await runDetector(tempPath.filePath);
  } finally {
    await cleanupTempPath(tempPath);
  }
}
