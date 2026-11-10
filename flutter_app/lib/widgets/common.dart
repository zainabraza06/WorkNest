import 'package:flutter/material.dart';

import '../core/constants.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../services/api_client.dart';

export '../core/constants.dart' show Tone;

/// Status pill. Tones match the web Badge.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, this.tone, {super.key});

  factory StatusBadge.booking(String status) {
    final m = bookingStatusMeta[status] ?? (titleCase(status), Tone.neutral);
    return StatusBadge(m.$1, m.$2);
  }

  factory StatusBadge.job(String status) {
    final m = jobStatusMeta[status] ?? (titleCase(status), Tone.neutral);
    return StatusBadge(m.$1, m.$2);
  }

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      Tone.solid => (Palette.ink950, Colors.white),
      Tone.success => (const Color(0xFFDCFCE7), const Color(0xFF166534)),
      Tone.warning => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
      Tone.danger => (const Color(0xFFFEE2E2), const Color(0xFF991B1B)),
      Tone.neutral => (Palette.ink100, Palette.ink700),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.url, this.size = 40});

  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: Palette.ink950, shape: BoxShape.circle),
      child: Text(
        initials(name),
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36),
      ),
    );
    if (url == null || url!.isEmpty) return fallback;
    return ClipOval(
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => fallback,
        loadingBuilder: (_, child, p) => p == null ? child : fallback,
      ),
    );
  }
}

/// Pulsing placeholder used while a list loads.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height = 16, this.width, this.radius = 8});

  final double height;
  final double? width;
  final double radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            color: Color.lerp(Palette.ink100, Palette.ink200, _c.value),
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        ),
      );
}

class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.count = 4});

  final int count;

  @override
  Widget build(BuildContext context) => ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: count,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, __) => const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Skeleton(height: 18, width: 180),
                SizedBox(height: 10),
                Skeleton(height: 12),
                SizedBox(height: 6),
                Skeleton(height: 12, width: 120),
              ],
            ),
          ),
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(color: Palette.ink100, shape: BoxShape.circle),
                child: Icon(icon, color: Palette.ink500, size: 28),
              ),
              const SizedBox(height: 16),
              Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
              if (message != null) ...[
                const SizedBox(height: 6),
                Text(message!, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
              ],
              if (action != null) ...[const SizedBox(height: 16), action!],
            ],
          ),
        ),
      );
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => EmptyState(
        icon: error is ApiException && (error as ApiException).isNetwork
            ? Icons.wifi_off_rounded
            : Icons.error_outline_rounded,
        title: 'Something went wrong',
        message: error is ApiException ? (error as ApiException).message : 'Please try again.',
        action: onRetry == null
            ? null
            : OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(160, 44)),
              ),
      );
}

/// Loads data once, shows skeleton / error / content, and supports pull-to-refresh while keeping
/// the previous data on screen so a refresh never flashes empty.
class AsyncLoader<T> extends StatefulWidget {
  const AsyncLoader({
    super.key,
    required this.load,
    required this.builder,
    this.skeleton,
  });

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() refresh) builder;
  final Widget? skeleton;

  @override
  State<AsyncLoader<T>> createState() => AsyncLoaderState<T>();
}

class AsyncLoaderState<T> extends State<AsyncLoader<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (_data == null) setState(() => _loading = true);
    try {
      final result = await widget.load();
      if (!mounted) return;
      setState(() {
        _data = result;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_data != null) {
      return RefreshIndicator(
        color: Palette.primary500,
        onRefresh: refresh,
        child: widget.builder(context, _data as T, refresh),
      );
    }
    if (_loading) return widget.skeleton ?? const ListSkeleton();
    return ErrorState(error: _error!, onRetry: refresh);
  }
}

void showError(BuildContext context, Object error) {
  final message = error is ApiException ? error.message : 'Something went wrong. Please try again.';
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: Palette.danger));
}

void showInfo(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Primary action button with an in-button spinner.
class LoadingButton extends StatelessWidget {
  const LoadingButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.accent = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool accent;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: loading ? null : onPressed,
        style: accent ? FilledButton.styleFrom(backgroundColor: Palette.primary500) : null,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: loading
              ? const SizedBox(
                  key: ValueKey('spinner'),
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                )
              : Row(
                  key: const ValueKey('label'),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                    Text(label),
                  ],
                ),
        ),
      );
}

/// Label/value row used on detail screens.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 110, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
            Expanded(
              child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, color: Palette.ink900)),
            ),
          ],
        ),
      );
}
