import 'dart:convert';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import 'receipt_doc.dart';

/// Ancho de papel de la impresora térmica.
enum PaperWidth {
  mm58(32, 384),
  mm80(48, 576);

  const PaperWidth(this.columns, this.dots);
  final int columns; // caracteres por línea con la fuente A
  final int dots; // puntos por línea (203 dpi)

  static PaperWidth fromMm(int mm) => mm == 58 ? mm58 : mm80;
  int get mm => this == mm58 ? 58 : 80;
}

/// Comandos ESC/POS (compatibles con las térmicas Epson y las genéricas chinas de 58/80 mm).
class EscPos {
  EscPos(this.paper);

  final PaperWidth paper;
  final _out = BytesBuilder();

  static const _esc = 0x1B;
  static const _gs = 0x1D;

  /// Página de códigos 850 (multilingüe latino): tildes, ñ, ¿ ¡ º · ×. Lo que no existe se reemplaza.
  static const _cp850 = {
    'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A,
    'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'Ä': 0x8E, 'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
    'Ö': 0x99, 'Ü': 0x9A, '×': 0x9E, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6,
    'º': 0xA7, '¿': 0xA8, '¡': 0xAD, '«': 0xAE, '»': 0xAF, 'Á': 0xB5, 'Â': 0xB6, 'À': 0xB7, 'Ê': 0xD2, 'Í': 0xD6,
    'Ó': 0xE0, 'Ô': 0xE2, 'Ú': 0xE9, '°': 0xF8, '·': 0xFA,
  };
  static const _replacements = {'−': '-', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '•': '·'};

  static List<int> encodeText(String text) {
    final bytes = <int>[];
    for (final rune in text.runes) {
      var ch = String.fromCharCode(rune);
      ch = _replacements[ch] ?? ch;
      for (final c in ch.runes) {
        if (c < 0x80) {
          bytes.add(c);
        } else {
          bytes.add(_cp850[String.fromCharCode(c)] ?? 0x3F); // '?'
        }
      }
    }
    return bytes;
  }

  void init() {
    _out.add([_esc, 0x40]); // reinicia
    _out.add([_esc, 0x74, 2]); // página de códigos 850
  }

  void align(int a) => _out.add([_esc, 0x61, a]); // 0 izq, 1 centro, 2 der
  void bold(bool on) => _out.add([_esc, 0x45, on ? 1 : 0]);
  void size({bool doubleHeight = false, bool doubleWidth = false}) => _out.add([_gs, 0x21, (doubleWidth ? 0x10 : 0) | (doubleHeight ? 0x01 : 0)]);
  void feed([int lines = 1]) => _out.add([_esc, 0x64, lines]);
  void cut() => _out.add([_gs, 0x56, 0x42, 0]); // corte parcial (las que no cortan lo ignoran)

  void line(String text) {
    _out.add(encodeText(text));
    _out.addByte(0x0A);
  }

  /// Texto partido en renglones del ancho del papel (por palabras).
  void wrapped(String text, {int? columns}) {
    for (final l in wrap(text, columns ?? paper.columns)) {
      line(l);
    }
  }

  void separator([String ch = '-']) => line(ch * paper.columns);

  /// Etiqueta a la izquierda y valor a la derecha; si no entran, el valor baja al renglón siguiente alineado a la derecha.
  void pair(String label, String value, {int? columns}) {
    final cols = columns ?? paper.columns;
    if (label.length + value.length + 1 <= cols) {
      line(label + ' ' * (cols - label.length - value.length) + value);
    } else {
      for (final l in wrap(label, cols)) {
        line(l);
      }
      for (final l in wrap(value, cols)) {
        line(l.padLeft(cols));
      }
    }
  }

  /// Imagen monocroma (firma) con GS v 0. Lo transparente y lo claro quedan en blanco.
  void image(img.Image source, {int? maxWidth}) {
    final limit = maxWidth ?? paper.dots;
    var im = source;
    if (im.width > limit) im = img.copyResize(im, width: limit);
    final widthBytes = (im.width + 7) ~/ 8;
    final data = Uint8List(widthBytes * im.height);
    for (var y = 0; y < im.height; y++) {
      for (var x = 0; x < im.width; x++) {
        final p = im.getPixel(x, y);
        final alpha = im.hasAlpha ? p.a / p.maxChannelValue : 1.0;
        final luminance = (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / p.maxChannelValue;
        if (alpha > 0.5 && luminance < 0.5) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    _out.add([_gs, 0x76, 0x30, 0, widthBytes & 0xFF, widthBytes >> 8, im.height & 0xFF, im.height >> 8]);
    _out.add(data);
  }

  Uint8List bytes() => _out.toBytes();

  static List<String> wrap(String text, int columns) {
    final out = <String>[];
    for (final paragraph in text.split('\n')) {
      var current = '';
      for (final word in paragraph.split(' ')) {
        var w = word;
        while (w.length > columns) {
          // palabra más larga que el renglón: se corta
          if (current.isNotEmpty) {
            out.add(current);
            current = '';
          }
          out.add(w.substring(0, columns));
          w = w.substring(columns);
        }
        if (current.isEmpty) {
          current = w;
        } else if (current.length + 1 + w.length <= columns) {
          current = '$current $w';
        } else {
          out.add(current);
          current = w;
        }
      }
      out.add(current);
    }
    return out;
  }
}

/// Decodifica la firma (PNG en data URL) para imprimirla; null si no se puede leer.
img.Image? decodeSignature(String? dataUrl) {
  if (dataUrl == null) return null;
  final comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  try {
    final decoded = img.decodePng(base64Decode(dataUrl.substring(comma + 1)));
    if (decoded == null) return null;
    return _trim(decoded);
  } catch (_) {
    return null;
  }
}

/// Recorta el margen vacío alrededor del trazo para no gastar papel.
img.Image _trim(img.Image im) {
  var minX = im.width, minY = im.height, maxX = -1, maxY = -1;
  for (var y = 0; y < im.height; y++) {
    for (var x = 0; x < im.width; x++) {
      final p = im.getPixel(x, y);
      final alpha = im.hasAlpha ? p.a / p.maxChannelValue : 1.0;
      final luminance = (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / p.maxChannelValue;
      if (alpha > 0.5 && luminance < 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return im;
  const pad = 4;
  final x0 = (minX - pad).clamp(0, im.width - 1), y0 = (minY - pad).clamp(0, im.height - 1);
  final x1 = (maxX + pad).clamp(0, im.width - 1), y1 = (maxY + pad).clamp(0, im.height - 1);
  return img.copyCrop(im, x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1);
}

/// Arma los bytes del comprobante para la térmica. [copyLabel]: ORIGINAL o COPIA n.
Uint8List encodeReceipt(ReceiptDoc r, PaperWidth paper, {String? copyLabel}) {
  final p = EscPos(paper)..init();
  final c = r.company;

  p.align(1);
  p.bold(true);
  p.size(doubleHeight: true);
  p.wrapped(c.name);
  p.size();
  p.bold(false);
  if (c.nit.isNotEmpty) p.wrapped('NIT ${c.nit}');
  if (c.address.isNotEmpty) p.wrapped(c.address);
  if (c.phone.isNotEmpty) p.wrapped('Tel. ${c.phone}');
  p.separator();
  p.bold(true);
  p.wrapped(r.title);
  p.bold(false);
  p.line('N.º ${r.number}');
  p.line(r.issuedAt);
  if (copyLabel != null) {
    p.bold(true);
    p.line(copyLabel);
    p.bold(false);
  }
  if (r.notice != null) {
    p.bold(true);
    p.wrapped('*** ${r.notice} ***');
    p.bold(false);
  }
  if (r.provisional) p.wrapped('(Provisorio: se confirma al sincronizar)');
  p.align(0);
  p.separator();

  for (final m in r.meta) {
    p.pair('${m.label}:', m.value);
  }
  if (r.items.isNotEmpty) p.separator();
  for (final i in r.items) {
    p.bold(true);
    if (i.amount != null) {
      p.pair(i.description, i.amount!);
    } else {
      p.wrapped(i.description);
    }
    p.bold(false);
    if (i.detail != null) p.wrapped('  ${i.detail}');
  }
  if (r.totals.isNotEmpty) p.separator();
  for (final t in r.totals) {
    if (t.strong) {
      // Total a doble alto para que se lea a simple vista.
      p.bold(true);
      p.size(doubleHeight: true);
      p.pair(t.label, t.value);
      p.size();
      p.bold(false);
    } else {
      p.pair(t.label, t.value);
    }
  }
  if (r.extra.isNotEmpty) p.separator();
  for (final e in r.extra) {
    p.pair('${e.label}:', e.value);
  }

  final signature = decodeSignature(r.signature);
  if (signature != null || r.signatureLabel != null) {
    p.feed(1);
    p.align(1);
    if (signature != null) {
      p.image(signature, maxWidth: (paper.dots * 0.75).round());
    } else {
      p.feed(3);
    }
    p.line('_' * (paper.columns - 8));
    p.wrapped(r.signatureLabel ?? 'Firma');
    p.align(0);
  }
  if (r.footer.isNotEmpty) {
    p.feed(1);
    p.align(1);
    p.wrapped(r.footer);
    p.align(0);
  }
  p.feed(4);
  p.cut();
  return p.bytes();
}
