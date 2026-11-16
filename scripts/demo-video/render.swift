// Renders 1920x1080 PNG overlays and title cards for the demo video.
// Usage: swift render.swift spec.json outdir
import AppKit
import Foundation

let W: CGFloat = 1920, H: CGFloat = 1080
let bg = NSColor(srgbRed: 0x0f/255, green: 0x14/255, blue: 0x18/255, alpha: 1)
let accent = NSColor(srgbRed: 0x4f/255, green: 0xc0/255, blue: 0xb6/255, alpha: 1)
let orange = NSColor(srgbRed: 0xff/255, green: 0x6a/255, blue: 0x13/255, alpha: 1)
let muted = NSColor(srgbRed: 0x98/255, green: 0xa4/255, blue: 0xaf/255, alpha: 1)
let white = NSColor(srgbRed: 0xe4/255, green: 0xe9/255, blue: 0xee/255, alpha: 1)

func font(_ size: CGFloat, _ weight: NSFont.Weight) -> NSFont { NSFont.systemFont(ofSize: size, weight: weight) }

func draw(_ text: String, _ f: NSFont, _ color: NSColor, in rect: NSRect, align: NSTextAlignment) {
  let p = NSMutableParagraphStyle(); p.alignment = align; p.lineBreakMode = .byWordWrapping; p.lineSpacing = 4
  (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin], attributes: [.font: f, .foregroundColor: color, .paragraphStyle: p])
}

// Flipped coordinates: y grows downward, like the video.
func render(_ path: String, opaque: Bool, _ body: () -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  let ctx = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx.cgContext, flipped: true)
  ctx.cgContext.translateBy(x: 0, y: H); ctx.cgContext.scaleBy(x: 1, y: -1)
  if opaque { bg.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
  body()
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

struct Item: Decodable { let file: String; let kind: String; let title: String?; let caption: String?; let lines: [String]? }
let args = CommandLine.arguments
let items = try! JSONDecoder().decode([Item].self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let out = args[2]

for it in items {
  let path = out + "/" + it.file
  switch it.kind {
  case "overlay":
    render(path, opaque: false) {
      // Side labels next to each phone (phones sit at x 534..930 and 990..1386).
      draw("Ben", font(44, .bold), orange, in: NSRect(x: 60, y: 360, width: 440, height: 60), align: .right)
      draw("Bitkit iOS", font(30, .semibold), white, in: NSRect(x: 60, y: 420, width: 440, height: 44), align: .right)
      draw("Swift · LDK", font(24, .regular), muted, in: NSRect(x: 60, y: 466, width: 440, height: 120), align: .right)
      draw("Ana", font(44, .bold), accent, in: NSRect(x: 1420, y: 360, width: 440, height: 60), align: .left)
      draw("Paykit × WDK wallet", font(30, .semibold), white, in: NSRect(x: 1420, y: 420, width: 440, height: 44), align: .left)
      draw("React Native · Tether WDK", font(24, .regular), muted, in: NSRect(x: 1420, y: 466, width: 440, height: 120), align: .left)
      // Caption strip.
      draw(it.title ?? "", font(30, .bold), accent, in: NSRect(x: 80, y: 912, width: W - 160, height: 44), align: .center)
      draw(it.caption ?? "", font(28, .regular), white, in: NSRect(x: 120, y: 960, width: W - 240, height: 100), align: .center)
    }
  case "labels":
    // Side labels only; stays on screen for the whole demo.
    render(path, opaque: false) {
      draw("Ben", font(44, .bold), orange, in: NSRect(x: 60, y: 360, width: 440, height: 60), align: .right)
      draw("Bitkit iOS", font(30, .semibold), white, in: NSRect(x: 60, y: 420, width: 440, height: 44), align: .right)
      draw("Swift · LDK", font(24, .regular), muted, in: NSRect(x: 60, y: 466, width: 440, height: 120), align: .right)
      draw("Ana", font(44, .bold), accent, in: NSRect(x: 1420, y: 360, width: 440, height: 60), align: .left)
      draw("Paykit × WDK wallet", font(30, .semibold), white, in: NSRect(x: 1420, y: 420, width: 440, height: 44), align: .left)
      draw("React Native · Tether WDK", font(24, .regular), muted, in: NSRect(x: 1420, y: 466, width: 440, height: 120), align: .left)
    }
  case "caption":
    // Caption strip only, so captions can crossfade without touching the labels.
    render(path, opaque: false) {
      draw(it.title ?? "", font(30, .bold), accent, in: NSRect(x: 80, y: 912, width: W - 160, height: 44), align: .center)
      draw(it.caption ?? "", font(28, .regular), white, in: NSRect(x: 120, y: 960, width: W - 240, height: 100), align: .center)
    }
  case "card":
    render(path, opaque: true) {
      let lines = it.lines ?? []
      draw(it.title ?? "", font(64, .bold), white, in: NSRect(x: 160, y: 200, width: W - 320, height: 160), align: .center)
      var y: CGFloat = 400
      for (i, l) in lines.enumerated() {
        let f = i == 0 ? font(34, .regular) : font(28, .regular)
        let c = i == 0 ? accent : ((l.hasPrefix("Not shown") || l.hasPrefix("Not stock")) ? orange : white)
        draw(l, f, c, in: NSRect(x: 220, y: y, width: W - 440, height: 100), align: .center)
        y += i == 0 ? 90 : 56
      }
    }
  default: break
  }
}
print("rendered \(items.count)")
