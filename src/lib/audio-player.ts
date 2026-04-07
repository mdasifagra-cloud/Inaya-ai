/**
 * AudioPlayer plays 24kHz PCM16 audio chunks from Gemini Live.
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private queue: Int16Array[] = [];

  constructor() {}

  async start() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.nextStartTime = this.audioContext.currentTime;
    this.isPlaying = true;
  }

  stop() {
    this.isPlaying = false;
    this.queue = [];
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  playChunk(base64Data: string) {
    if (!this.isPlaying || !this.audioContext) return;

    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = this.pcm16ToFloat32(pcm16);
    
    const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
  }

  private pcm16ToFloat32(input: Int16Array): Float32Array {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] / 0x8000;
    }
    return output;
  }
  
  clearQueue() {
    // For interruptions, we want to stop current playback and clear the queue
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.nextStartTime = this.audioContext.currentTime;
    }
  }
}
