import argparse
import sys
import os
import json
from datetime import datetime

import librosa
import numpy as np
import torch
from torch import Tensor
from torch.nn import functional as F
from model import RawNet
import yaml

def pad_to_length(x, target_len):
    x_len = x.shape[0]
    if x_len >= target_len:
        return x[:target_len]
    pad_len = target_len - x_len
    return np.pad(x, (0, pad_len), mode='constant')


CHUNK_DURATION_SEC = 2.5
TARGET_SR = 24000
MIN_SEGMENT_SAMPLES = int(0.15 * TARGET_SR)
CHUNK_SAMPLES = int(CHUNK_DURATION_SEC * TARGET_SR)
CAUTION_THRESHOLD = 0.85
HIGH_THRESHOLD = 0.95
BINARY_HIGH_THRESHOLD = 0.95


def mu_law_encode(audio, mu=255):
    audio = np.clip(audio, -1.0, 1.0)
    return np.sign(audio) * np.log1p(mu * np.abs(audio)) / np.log1p(mu)


def mu_law_decode(encoded, mu=255):
    return np.sign(encoded) * (1.0 / mu) * ((1 + mu) ** np.abs(encoded) - 1)


def simulate_twilio_audio(y, sr):
    if sr != 8000:
        y = librosa.resample(y, orig_sr=sr, target_sr=8000)
        sr = 8000
    encoded = mu_law_encode(y)
    decoded = mu_law_decode(encoded)
    if sr != TARGET_SR:
        decoded = librosa.resample(decoded, orig_sr=sr, target_sr=TARGET_SR)
    return decoded


def detect_voiced_intervals(y, sr):
    intervals = librosa.effects.split(
        y,
        top_db=24,
        frame_length=1024,
        hop_length=512
    )
    segments = []
    for start, end in intervals:
        if end - start >= MIN_SEGMENT_SAMPLES:
            segments.append(y[start:end])
    return segments


def chunk_segments(segments):
    chunks = []
    for segment in segments:
        offset = 0
        while offset < len(segment):
            slice_end = offset + CHUNK_SAMPLES
            chunk = segment[offset:slice_end]
            if len(chunk) == 0:
                break
            chunk = pad_to_length(chunk, CHUNK_SAMPLES)
            chunks.append(Tensor(chunk))
            offset += CHUNK_SAMPLES
    return chunks


def load_sample(sample_path):
    y, sr = librosa.load(sample_path, sr=None)
    y = simulate_twilio_audio(y, sr)
    segments = detect_voiced_intervals(y, TARGET_SR)
    if not segments:
        return [Tensor(pad_to_length(y, CHUNK_SAMPLES))]
    chunks = chunk_segments(segments)
    return chunks
    

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input_path', type=str, help='This path should be an external path point to an audio file')
    parser.add_argument('--model_path', type=str, help='This path should be an external path point to an audio file')
    args = parser.parse_args()

    input_path = args.input_path
    model_path = args.model_path

    # load model config
    dir_yaml = 'model_config_RawNet.yaml'
    with open(dir_yaml, 'r') as f_yaml:
        parser1 = yaml.safe_load(f_yaml)
    
    # load cuda
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print('Device: {}'.format(device))
    
    # init model
    model = RawNet(parser1['model'], device)
    model =(model).to(device)
    
    model.load_state_dict(torch.load(model_path, map_location=device))
    print('Model loaded : {}'.format(model_path))
    
    model.eval()
    
chunk_fake_scores = []
chunk_real_scores = []
chunk_multi_scores = []
chunks = load_sample(input_path)
for chunk_tensor in chunks:
    m_batch = chunk_tensor.to(device=device, dtype=torch.float).unsqueeze(0)
    logits, multi_logits = model(m_batch)
    probs = F.softmax(logits, dim=-1)
    probs_multi = F.softmax(multi_logits, dim=-1)
    chunk_fake_scores.append(probs[0, 0].item())
    chunk_real_scores.append(probs[0, 1].item())
    chunk_multi_scores.append(probs_multi.tolist()[0])

result_multi = np.average(chunk_multi_scores, axis=0).tolist()
result_binary = np.average(
    [[fake, real] for fake, real in zip(chunk_fake_scores, chunk_real_scores)], axis=0
).tolist()
binary_average_fake = float(result_binary[0]) if result_binary else 0.0

median_fake = float(np.median(chunk_fake_scores)) if chunk_fake_scores else None
max_fake = float(np.max(chunk_fake_scores)) if chunk_fake_scores else None
chunk_count = len(chunk_fake_scores)
high_chunk_count = sum(1 for score in chunk_fake_scores if score >= HIGH_THRESHOLD)
high_chunk_ratio = high_chunk_count / chunk_count if chunk_count else 0
alert_band = 'none'
if chunk_count > 0:
    if (
        median_fake is not None
        and median_fake >= HIGH_THRESHOLD
        and binary_average_fake >= BINARY_HIGH_THRESHOLD
        and high_chunk_ratio >= 0.5
    ):
        alert_band = 'high'
    elif (
        median_fake is not None
        and median_fake >= CAUTION_THRESHOLD
    ) or binary_average_fake >= CAUTION_THRESHOLD:
        alert_band = 'caution'

print(
    'Multi classification result : gt:{}, wavegrad:{}, diffwave:{}, parallel wave gan:{}, wavernn:{}, wavenet:{}, melgan:{}'.format(
        result_multi[0],
        result_multi[1],
        result_multi[2],
        result_multi[3],
        result_multi[4],
        result_multi[5],
        result_multi[6],
    )
)
print('Binary classification result : fake:{}, real:{}'.format(result_binary[0], result_binary[1]))
print(f'Chunk analysis count: {chunk_count}')
aggregated = {
    'median_fake': median_fake,
    'max_fake': max_fake,
    'chunk_count': chunk_count,
    'fake_scores': chunk_fake_scores,
    'real_scores': chunk_real_scores,
    'high_chunk_count': high_chunk_count,
    'high_chunk_ratio': round(high_chunk_ratio, 3),
    'alert_band': alert_band,
    'binary_average_fake': binary_average_fake,
}
print('AGGREGATED_RESULT:', json.dumps(aggregated))
