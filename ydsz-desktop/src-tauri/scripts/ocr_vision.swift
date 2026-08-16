// ocr_vision.swift
// ydsz-buddy macOS Vision OCR
//
// 用法: swift ocr_vision.swift <image_path> <language>
//  - image_path: 图像绝对路径(PNG / JPEG / HEIC / TIFF)
//  - language:   BCP-47 语言标签(如 "zh-Hans"、"en-US"),默认 "en-US"
//
// 输出:每行一段识别出的文字到 stdout。
//       任意错误:打印到 stderr 并以非 0 退出码退出。

import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write("[ocr_vision] usage: swift ocr_vision.swift <image_path> [language]\n".data(using: .utf8)!)
    exit(2)
}

let imagePath = CommandLine.arguments[1]
let lang = CommandLine.arguments.count >= 3 ? CommandLine.arguments[2] : "en-US"

guard let nsImage = NSImage(contentsOfFile: imagePath) else {
    FileHandle.standardError.write("[ocr_vision] cannot load image: \(imagePath)\n".data(using: .utf8)!)
    exit(3)
}

// NSImage → CGImage
var rect = CGRect(origin: .zero, size: nsImage.size)
guard let cgImage = nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    FileHandle.standardError.write("[ocr_vision] cannot extract CGImage from NSImage\n".data(using: .utf8)!)
    exit(4)
}

let request = VNRecognizeTextRequest { req, err in
    if let err = err {
        FileHandle.standardError.write("[ocr_vision] VNRecognizeTextRequest error: \(err)\n".data(using: .utf8)!)
        exit(5)
    }
    guard let observations = req.results as? [VNRecognizedTextObservation] else {
        return
    }
    // 按 y 坐标从高到低排序,保证行顺序稳定
    let sorted = observations.sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }
    var lines: [String] = []
    for obs in sorted {
        if let candidate = obs.topCandidates(1).first {
            lines.append(candidate.string)
        }
    }
    let output = lines.joined(separator: "\n")
    FileHandle.standardOutput.write(output.data(using: .utf8)!)
    if !output.isEmpty {
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
// 把 BCP-47 切到主语言标签传入(Vision 仅识别主要 lang 段,例如 "zh-Hans" → "zh-Hans")
request.recognitionLanguages = [lang]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("[ocr_vision] perform failed: \(error)\n".data(using: .utf8)!)
    exit(6)
}
