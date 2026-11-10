import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../services/repository.dart';
import 'common.dart';

/// AI fair-price guidance. Renders nothing when the service is unavailable — guidance must
/// never block someone from posting or bidding (same contract as the web FairPriceHint).
class FairPriceHint extends StatefulWidget {
  const FairPriceHint({
    super.key,
    required this.category,
    this.city,
    this.durationType = 'one_day',
    this.durationCount = 1,
    this.urgency,
    required this.onApply,
    this.applyLabel = 'Use typical price',
  });

  final String? category;
  final String? city;
  final String durationType;
  final int durationCount;
  final String? urgency;
  final void Function(num min, num max, num median) onApply;
  final String applyLabel;

  @override
  State<FairPriceHint> createState() => _FairPriceHintState();
}

class _FairPriceHintState extends State<FairPriceHint> {
  Future<Json?>? _future;
  String _key = '';

  String get _currentKey =>
      '${widget.category}|${widget.city}|${widget.durationType}|${widget.durationCount}|${widget.urgency}';

  Future<Json?> _fetch() async {
    try {
      return await context.read<Repository>().priceSuggestion({
        'category': widget.category,
        'city': widget.city,
        'durationType': widget.durationType,
        'durationCount': widget.durationCount,
        'urgency': widget.urgency,
      });
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.category == null) return const SizedBox.shrink();
    if (_key != _currentKey) {
      _key = _currentKey;
      _future = _fetch();
    }
    return FutureBuilder<Json?>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 4),
            child: Skeleton(height: 64, radius: 12),
          );
        }
        final data = snap.data;
        if (data == null) return const SizedBox.shrink();
        final min = data['min'] as num, max = data['max'] as num, median = (data['median'] ?? (min + max) / 2) as num;
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Palette.primary50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Palette.primary100),
          ),
          child: Row(
            children: [
              const Icon(Icons.balance_rounded, color: Palette.primary600),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('FAIR PRICE GUIDE',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.1, color: Palette.primary600)),
                    const SizedBox(height: 2),
                    Text('${formatPKR(min)} – ${formatPKR(max)}',
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Palette.ink950)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => widget.onApply(min, max, median),
                child: Text(widget.applyLabel),
              ),
            ],
          ),
        );
      },
    );
  }
}
