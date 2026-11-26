import AVFoundation
import CoreVideo
import Foundation
import Vision

let srcPath = CommandLine.arguments[1]
let destPath = CommandLine.arguments[2]
let asset = AVURLAsset(url: URL(fileURLWithPath: srcPath))
guard let track = asset.tracks(withMediaType: .video).first else {
  fputs("no video track\n", stderr)
  exit(1)
}
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
])
output.alwaysCopiesSampleData = false
reader.add(output)
guard reader.startReading() else {
  fputs(reader.error?.localizedDescription ?? "reader failed\n", stderr)
  exit(1)
}

func stamp(_ seconds: Double) -> String {
  let clamped = max(0, seconds)
  let ms = Int((clamped * 1000).rounded())
  let h = ms / 3_600_000
  let m = (ms / 60_000) % 60
  let s = (ms / 1000) % 60
  let milli = ms % 1000
  return String(format: "%02d:%02d:%02d,%03d", h, m, s, milli)
}

func isEnglishLine(_ line: String) -> Bool {
  let letters = line.filter(\.isLetter)
  let latin = letters.filter(\.isASCII)
  let lower = latin.filter(\.isLowercase)
  return line.contains(" ")
    && latin.count >= 8
    && Double(latin.count) / Double(max(letters.count, 1)) > 0.85
    && Double(lower.count) / Double(max(latin.count, 1)) > 0.5
}

func noisyToken(_ word: String) -> Bool {
  let letters = word.filter(\.isLetter)
  if letters.contains(where: { !$0.isASCII }) { return true }
  if word.contains(where: { "#*@&=~^|<>[]{}_".contains($0) }) { return true }
  if letters.count >= 3 && letters.allSatisfy(\.isUppercase) { return true }
  return word.contains(where: \.isNumber) && letters.count >= 2
}

func stripNoise(_ line: String) -> String {
  var words = line.split(whereSeparator: \.isWhitespace).map(String.init)
  while let first = words.first, noisyToken(first) || first == "-" || first == "—" {
    words.removeFirst()
  }
  while let last = words.last, noisyToken(last) {
    words.removeLast()
  }
  return words.joined(separator: " ")
}

func englishLine(from buffer: CVPixelBuffer) -> String {
  let height = CVPixelBufferGetHeight(buffer)
  let band = min(96, height)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US"]
  request.usesLanguageCorrection = true
  request.regionOfInterest = CGRect(x: 0.08, y: 0, width: 0.84, height: Double(band) / Double(height))
  let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:])
  try? handler.perform([request])
  let ordered = (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
  let lines = ordered.compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
  return lines.map(stripNoise).filter(isEnglishLine).joined(separator: " ")
}

func normalize(_ line: String) -> String {
  let cleaned = line.lowercased().map { ch -> Character in
    (ch.isLetter || ch.isNumber || ch == " ") ? ch : " "
  }
  return String(cleaned).split(separator: " ").joined(separator: " ")
}

func similar(_ a: String, _ b: String) -> Bool {
  let ta = Set(normalize(a).split(separator: " "))
  let tb = Set(normalize(b).split(separator: " "))
  if ta.isEmpty || tb.isEmpty { return false }
  let inter = ta.intersection(tb).count
  return Double(inter) / Double(max(ta.count, tb.count)) >= 0.72
}

func bestText(_ texts: [String]) -> String {
  var buckets: [String: [String]] = [:]
  for text in texts where !text.isEmpty {
    buckets[normalize(text), default: []].append(text)
  }
  guard let winner = buckets.max(by: { lhs, rhs in
    if lhs.value.count != rhs.value.count { return lhs.value.count < rhs.value.count }
    return lhs.key.count < rhs.key.count
  }) else { return "" }
  return winner.value.max { lhs, rhs in
    let ls = lhs.count + (lhs.contains(where: { ".?!".contains($0) }) ? 12 : 0)
    let rs = rhs.count + (rhs.contains(where: { ".?!".contains($0) }) ? 12 : 0)
    return ls < rs
  } ?? winner.value[0]
}

func bandSignature(_ buffer: CVPixelBuffer) -> UInt64 {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
  let height = CVPixelBufferGetHeight(buffer)
  let width = CVPixelBufferGetWidth(buffer)
  let stride = CVPixelBufferGetBytesPerRow(buffer)
  let ptr = base.assumingMemoryBound(to: UInt8.self)
  let start = max(0, height - 78)
  var hash: UInt64 = 1469598103934665603
  var y = start
  while y < height {
    var x = 0
    while x < width {
      let i = y * stride + x * 4
      let lum = (UInt64(ptr[i]) + UInt64(ptr[i + 1]) + UInt64(ptr[i + 2])) / 96
      hash ^= lum
      hash &*= 1099511628211
      x += 24
    }
    y += 3
  }
  return hash
}

var cues: [(Double, Double, String)] = []
var openStart: Double?
var openVariants: [String] = []
var lastSignature: UInt64 = 0
var nextSample = 0.0
var lastReport = 0.0

func closeCue(at end: Double) {
  let variants = openVariants
  let start = openStart
  openStart = nil
  openVariants = []
  guard let start, !variants.isEmpty else { return }
  let text = bestText(variants)
  guard !text.isEmpty, end - start >= 0.55 else { return }
  if let last = cues.indices.last, similar(text, cues[last].2), start - cues[last].1 < 0.8 {
    cues[last].1 = end
    cues[last].2 = bestText([cues[last].2, text])
    return
  }
  cues.append((start, end, text))
}

func writeSRT() {
  var body = ""
  for (index, cue) in cues.enumerated() {
    body += "\(index + 1)\n\(stamp(cue.0)) --> \(stamp(cue.1))\n\(cue.2)\n\n"
  }
  try? body.write(to: URL(fileURLWithPath: destPath), atomically: true, encoding: .utf8)
}

while let sample = output.copyNextSampleBuffer() {
  let pts = CMSampleBufferGetPresentationTimeStamp(sample).seconds
  if pts + 0.02 < nextSample { continue }
  nextSample = pts + 0.4
  guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
  let signature = bandSignature(buffer)
  if signature == lastSignature { continue }
  lastSignature = signature
  let text = englishLine(from: buffer)
  if text.isEmpty {
    closeCue(at: pts)
  } else if openStart != nil, similar(text, bestText(openVariants)) {
    openVariants.append(text)
  } else {
    closeCue(at: pts)
    openStart = pts
    openVariants = [text]
  }
  if pts - lastReport > 60 {
    writeSRT()
    lastReport = pts
    fputs(String(format: "progress %.0f min, %d cues\n", pts / 60, cues.count), stderr)
  }
}
let end = asset.duration.seconds
closeCue(at: end.isFinite ? end : nextSample)
writeSRT()
fputs("done \(cues.count) cues\n", stderr)
