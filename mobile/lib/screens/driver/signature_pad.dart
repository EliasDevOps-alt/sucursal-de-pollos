import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Controla los trazos de la firma y la exporta como PNG (data URL) para enviarla al servidor.
class SignatureController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];
  Size _size = Size.zero;

  List<List<Offset>> get strokes => _strokes;
  bool get isEmpty => _strokes.every((s) => s.length < 2);

  void _start(Offset p) {
    _strokes.add([p]);
    notifyListeners();
  }

  void _extend(Offset p) {
    if (_strokes.isEmpty) return;
    _strokes.last.add(p);
    notifyListeners();
  }

  void clear() {
    _strokes.clear();
    notifyListeners();
  }

  /// Firma en negro sobre blanco, del tamaño del recuadro (se ve igual en el comprobante de la web).
  Future<String?> toPngDataUrl() async {
    if (isEmpty || _size == Size.zero) return null;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Offset.zero & _size, Paint()..color = Colors.white);
    _SignaturePainter(_strokes, Colors.black).paint(canvas, _size);
    final image = await recorder.endRecording().toImage(_size.width.round(), _size.height.round());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return null;
    return 'data:image/png;base64,${base64Encode(bytes.buffer.asUint8List())}';
  }
}

class SignaturePad extends StatelessWidget {
  const SignaturePad({super.key, required this.controller, this.height = 170, this.onDrawing});
  final SignatureController controller;
  final double height;

  /// Avisa cuando se empieza y termina un trazo, para que la pantalla deje de desplazarse mientras se firma.
  final ValueChanged<bool>? onDrawing;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, box) {
      controller._size = Size(box.maxWidth, height);
      return Container(
        height: height,
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: cs.outline), borderRadius: BorderRadius.circular(8)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Listener(
            // Eventos de puntero crudos: el trazo no compite con el desplazamiento de la pantalla.
            onPointerDown: (e) {
              onDrawing?.call(true);
              controller._start(e.localPosition);
            },
            onPointerMove: (e) => controller._extend(e.localPosition),
            onPointerUp: (_) => onDrawing?.call(false),
            onPointerCancel: (_) => onDrawing?.call(false),
            child: AnimatedBuilder(
              animation: controller,
              builder: (_, __) => Stack(children: [
                CustomPaint(painter: _SignaturePainter(controller.strokes, Colors.black), size: Size(box.maxWidth, height)),
                if (controller.isEmpty)
                  const Center(child: Text('Firme aquí con el dedo', style: TextStyle(color: Colors.black38))),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 28,
                  child: Container(height: 1, color: Colors.black26),
                ),
              ]),
            ),
          ),
        ),
      );
    });
  }
}

class _SignaturePainter extends CustomPainter {
  _SignaturePainter(this.strokes, this.color);
  final List<List<Offset>> strokes;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final s in strokes) {
      if (s.length < 2) continue;
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (final p in s.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter old) => true;
}
