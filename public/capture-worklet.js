// Collects microphone samples and hands them over about four times a second.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.size = Math.round(sampleRate / 4)
    this.buffer = new Float32Array(this.size)
    this.used = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    let from = 0
    while (from < channel.length) {
      const n = Math.min(channel.length - from, this.size - this.used)
      this.buffer.set(channel.subarray(from, from + n), this.used)
      this.used += n
      from += n
      if (this.used === this.size) {
        this.port.postMessage(this.buffer)
        this.buffer = new Float32Array(this.size)
        this.used = 0
      }
    }
    return true
  }
}
registerProcessor('capture', Capture)
