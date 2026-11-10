import 'package:flutter/material.dart';

import '../core/theme.dart';

/// The WorkNest mark: an ink tile carrying an orange "W" stroke. Same geometry as the web
/// Logo (frontend/src/components/layout/Logo.jsx), drawn natively so it stays sharp at any size
/// and can animate.
///
/// [tile] scales the tile in (0..1); [stroke] draws the W along its path (0..1).
class WorkNestMark extends StatelessWidget {
  const WorkNestMark({
    super.key,
    this.size = 64,
    this.tile = 1,
    this.stroke = 1,
    this.invert = false,
  });

  final double size;
  final double tile;
  final double stroke;
  final bool invert;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _MarkPainter(tile: tile, stroke: stroke, invert: invert)),
      );
}

class _MarkPainter extends CustomPainter {
  _MarkPainter({required this.tile, required this.stroke, required this.invert});

  final double tile;
  final double stroke;
  final bool invert;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 28;
    final scale = Curves.easeOutBack.transform(tile.clamp(0, 1));

    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(scale);
    canvas.translate(-size.width / 2, -size.height / 2);

    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, size.width, size.height), Radius.circular(5 * s)),
      Paint()..color = invert ? Colors.white : Palette.ink950,
    );

    final w = Path()
      ..moveTo(6 * s, 9.5 * s)
      ..lineTo(10 * s, 19 * s)
      ..lineTo(14 * s, 12.5 * s)
      ..lineTo(18 * s, 19 * s)
      ..lineTo(22 * s, 9.5 * s);

    final paint = Paint()
      ..color = Palette.primary500
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    for (final metric in w.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * stroke.clamp(0, 1)), paint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.tile != tile || old.stroke != stroke || old.invert != invert;
}

/// Mark + wordmark, as used in headers.
class WorkNestLogo extends StatelessWidget {
  const WorkNestLogo({super.key, this.size = 32, this.invert = false});

  final double size;
  final bool invert;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          WorkNestMark(size: size, invert: invert),
          SizedBox(width: size * 0.3),
          Text(
            'WorkNest',
            style: TextStyle(
              fontSize: size * 0.62,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
              color: invert ? Colors.white : Palette.ink950,
            ),
          ),
        ],
      );
}
