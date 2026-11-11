import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../state/server_wake_state.dart';
import 'logo.dart';

/// Full-screen notice for the free-tier cold start. Renders nothing at all unless the server is
/// actually slow, so a warm server never shows it. Place it last in a [Stack] above the app.
class ServerWakeOverlay extends StatelessWidget {
  const ServerWakeOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final wake = context.watch<ServerWakeState>();
    if (!wake.visible) return const SizedBox.shrink();
    return Positioned.fill(
      child: WakeCard(
        status: wake.status,
        elapsed: wake.elapsed,
        onDismiss: wake.dismiss,
        onRetry: wake.retry,
      ),
    );
  }
}

/// The scrim and card, driven by plain values so every state can be rendered in a test.
class WakeCard extends StatelessWidget {
  const WakeCard({
    super.key,
    required this.status,
    required this.elapsed,
    required this.onDismiss,
    required this.onRetry,
  });

  final WakeStatus status;
  final int elapsed;
  final VoidCallback onDismiss;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (status != WakeStatus.waking && status != WakeStatus.ready && status != WakeStatus.failed) {
      return const SizedBox.shrink();
    }
    final text = Theme.of(context).textTheme;
    return Material(
      color: Palette.ink950.withValues(alpha: 0.62), // also absorbs taps on the app underneath
      child: SafeArea(
        child: Align(
          alignment: Alignment.center,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Semantics(
                liveRegion: true,
                container: true,
                child: Container(
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 32, offset: Offset(0, 12))],
                  ),
                  child: AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    alignment: Alignment.topCenter,
                    child: switch (status) {
                      WakeStatus.waking => _waking(text),
                      WakeStatus.ready => _ready(text),
                      _ => _failed(text),
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(Widget leading, String title, String subtitle, TextTheme text) => Row(
        children: [
          leading,
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                const SizedBox(height: 2),
                Text(subtitle, style: text.bodyMedium?.copyWith(color: Palette.ink600)),
              ],
            ),
          ),
        ],
      );

  Widget _waking(TextTheme text) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _header(const WorkNestMark(size: 40), 'Server is waking up', 'Free tier on Render · ${elapsed}s', text),
          const SizedBox(height: 20),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: const LinearProgressIndicator(
              minHeight: 6,
              color: Palette.primary500,
              backgroundColor: Palette.ink100,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'WorkNest runs on a free server that sleeps after 15 minutes without visitors. '
            'Starting it again takes about 30 to 50 seconds, only after a quiet spell. '
            "We'll tell you the moment it's ready.",
            style: text.bodyMedium?.copyWith(color: Palette.ink600, height: 1.45),
          ),
          const SizedBox(height: 12),
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: onDismiss, child: const Text('Dismiss'))),
        ],
      );

  Widget _ready(TextTheme text) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _header(
            const Icon(Icons.check_circle_outline, size: 40, color: Palette.success),
            'Server is up',
            'Woke up in ${elapsed}s. You can continue working.',
            text,
          ),
          const SizedBox(height: 20),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(autofocus: true, onPressed: onDismiss, child: const Text('Continue')),
          ),
        ],
      );

  Widget _failed(TextTheme text) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _header(
            const Icon(Icons.cloud_off_outlined, size: 40, color: Palette.danger),
            "Still can't reach the server",
            "It hasn't answered for a few minutes.",
            text,
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(onPressed: onDismiss, child: const Text('Dismiss')),
              const SizedBox(width: 8),
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ],
      );
}
