import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../core/constants.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';
import '../jobs/job_detail_screen.dart' show askReason;

/// One booking and the actions each side may take at each stage:
///
///   pending_payment -> client pays escrow (hand-off to web; Stripe Elements lives there)
///   confirmed       -> worker starts the job
///   in_progress     -> client confirms completion, releasing escrow
///   completed       -> client reviews the worker
class BookingDetailScreen extends StatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen> with WidgetsBindingObserver {
  final _loader = GlobalKey<AsyncLoaderState<Json>>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Coming back from the browser after paying: pick up the new status
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _loader.currentState?.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return Scaffold(
      appBar: AppBar(title: const Text('Booking')),
      body: AsyncLoader<Json>(
        key: _loader,
        load: () async {
          final b = await repo.booking(widget.bookingId);
          return b;
        },
        skeleton: const ListSkeleton(count: 3),
        builder: (context, booking, refresh) => _Body(booking: booking, onChanged: refresh),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.booking, required this.onChanged});

  final Json booking;
  final Future<void> Function() onChanged;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  bool _busy = false;

  Json get b => widget.booking;
  String get id => b['_id'] as String;

  Future<void> _act(Future<dynamic> Function(Repository repo) action, {String? done}) async {
    setState(() => _busy = true);
    try {
      await action(context.read<Repository>());
      if (!mounted) return;
      if (done != null) showInfo(context, done);
      await widget.onChanged();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openWeb() async {
    final uri = Uri.parse('${AppConfig.webOrigin}/bookings/$id');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
      showError(context, ApiException('Could not open the browser.'));
    }
  }

  Future<bool> _confirm(String title, String message, String action) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: FilledButton.styleFrom(minimumSize: const Size(110, 44)),
              child: Text(action),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _review() async {
    final result = await showModalBottomSheet<Json>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ReviewSheet(),
    );
    if (result == null || !mounted) return;
    await _act((r) => r.review(id, result), done: 'Thanks for your review');
  }

  @override
  Widget build(BuildContext context) {
    final role = b['myRole'] as String?;
    final isClient = role == 'client';
    final status = b['status'] as String;
    final job = b['job'] as Json?;
    final worker = b['worker'] as Json?;
    final client = b['client'] as Json?;
    final other = isClient ? worker : client;
    final payment = b['payment'] as Json?;
    final timeline = (b['timeline'] as List?)?.cast<Json>() ?? const [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [StatusBadge.booking(status), const Spacer(), Text(formatPKR(b['agreedPrice'] as num?), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))]),
        const SizedBox(height: 12),
        Text((job?['title'] as String?) ?? 'Job', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 4),
        if (job != null) Text(categoryMap[job['category']]?.label ?? '', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 16),
        _Stepper(status: status),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: Avatar(name: (other?['name'] as String?) ?? '?', url: (other?['avatar'] as Json?)?['url'] as String?),
            title: Text((other?['name'] as String?) ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
              // Contact details only come back after the client pays into escrow
              [other?['phone'], other?['email']].where((e) => e != null).join(' · ').ifEmpty(isClient ? 'Your worker' : 'Your client'),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              InfoRow('Duration', formatDuration(b['durationType'] as String?, (b['durationCount'] as num?)?.toInt() ?? 1)),
              InfoRow('Dates', '${formatDate(b['startDate'])} → ${formatDate(b['endDate'])}'),
              InfoRow('Location', [job?['city'], job?['address']].where((e) => e != null && '$e'.isNotEmpty).join(' · ')),
              if (payment != null) InfoRow('Payment', _paymentLabel(payment['status'] as String?)),
              if ((b['terms'] as String?)?.isNotEmpty ?? false) InfoRow('Terms', b['terms'] as String),
              if ((b['cancellationReason'] as String?)?.isNotEmpty ?? false) InfoRow('Cancelled', b['cancellationReason'] as String),
            ]),
          ),
        ),
        const SizedBox(height: 20),
        ..._actions(role, status),
        const SizedBox(height: 24),
        Text('Activity', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        for (final t in timeline.reversed)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(margin: const EdgeInsets.only(top: 5, right: 10), width: 8, height: 8, decoration: const BoxDecoration(color: Palette.primary500, shape: BoxShape.circle)),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text((t['note'] as String?) ?? titleCase('${t['status']}'), style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(timeAgo(t['at']), style: Theme.of(context).textTheme.bodySmall),
                ]),
              ),
            ]),
          ),
      ],
    );
  }

  List<Widget> _actions(String? role, String status) {
    final isClient = role == 'client';
    final isWorker = role == 'worker';
    final widgets = <Widget>[];

    if (status == 'pending_payment' && isClient) {
      widgets.addAll([
        const Text('Pay into escrow to confirm this booking. The worker is only paid when you confirm the job is done.'),
        const SizedBox(height: 12),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Palette.primary500),
          onPressed: _openWeb,
          icon: const Icon(Icons.lock_outline),
          label: const Text('Pay securely on web'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _act((r) => r.syncPayment(id), done: 'Payment status updated'),
          icon: const Icon(Icons.refresh),
          label: const Text("I've paid — refresh status"),
        ),
      ]);
    }
    if (status == 'pending_payment' && isWorker) {
      widgets.add(const Text('Waiting for the client to pay into escrow.'));
    }
    if (status == 'confirmed' && isWorker) {
      widgets.add(LoadingButton(
        label: 'Start job',
        icon: Icons.play_arrow_rounded,
        loading: _busy,
        accent: true,
        onPressed: () async {
          if (await _confirm('Start this job?', 'The client will be notified that work has begun.', 'Start')) {
            await _act((r) => r.startBooking(id), done: 'Job started');
          }
        },
      ));
    }
    if (status == 'confirmed' && isClient) {
      widgets.add(const Text('Payment is held in escrow. The worker will start soon.'));
    }
    if (status == 'in_progress' && isClient) {
      widgets.add(LoadingButton(
        label: 'Confirm complete & release payment',
        icon: Icons.verified_outlined,
        loading: _busy,
        accent: true,
        onPressed: () async {
          if (await _confirm('Release payment?', 'Only confirm once the work is done. This pays the worker from escrow.', 'Release')) {
            await _act((r) => r.completeBooking(id), done: 'Payment released');
          }
        },
      ));
    }
    if (status == 'in_progress' && isWorker) {
      widgets.add(const Text('The client confirms completion to release your payment.'));
    }
    if (status == 'completed' && isClient) {
      widgets.add(OutlinedButton.icon(
        onPressed: _busy ? null : _review,
        icon: const Icon(Icons.star_outline_rounded),
        label: const Text('Leave a review'),
      ));
    }
    if (const ['pending_payment', 'confirmed'].contains(status)) {
      widgets
        ..add(const SizedBox(height: 10))
        ..add(OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: Palette.danger),
          onPressed: _busy
              ? null
              : () async {
                  final reason = await askReason(context, 'Cancel this booking?', 'Any held payment is refunded to the client.');
                  if (reason != null) await _act((r) => r.cancelBooking(id, reason), done: 'Booking cancelled');
                },
          icon: const Icon(Icons.cancel_outlined),
          label: const Text('Cancel booking'),
        ));
    }
    if (status == 'in_progress' || status == 'disputed') {
      widgets
        ..add(const SizedBox(height: 10))
        ..add(TextButton.icon(
          onPressed: _openWeb,
          icon: const Icon(Icons.open_in_new, size: 18),
          label: Text(status == 'disputed' ? 'View dispute on web' : 'Cancel or dispute on web'),
        ));
    }
    return widgets;
  }

  String _paymentLabel(String? s) => switch (s) {
        'held' => 'Held in escrow',
        'released' => 'Released to worker',
        'refunded' => 'Refunded',
        'failed' => 'Payment failed',
        'requires_payment' => 'Not paid yet',
        _ => titleCase(s ?? ''),
      };
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.status});

  final String status;

  static const _steps = [
    ('pending_payment', 'Payment'),
    ('confirmed', 'Confirmed'),
    ('in_progress', 'In progress'),
    ('completed', 'Completed'),
  ];

  @override
  Widget build(BuildContext context) {
    if (status == 'cancelled' || status == 'disputed') return const SizedBox.shrink();
    final current = _steps.indexWhere((s) => s.$1 == status);
    return Row(
      children: [
        for (var i = 0; i < _steps.length; i++) ...[
          Expanded(
            child: Column(children: [
              Container(
                height: 6,
                decoration: BoxDecoration(
                  color: i <= current ? Palette.primary500 : Palette.ink200,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(height: 6),
              Text(_steps[i].$2,
                  style: TextStyle(fontSize: 11, fontWeight: i == current ? FontWeight.w800 : FontWeight.w500, color: i <= current ? Palette.ink950 : Palette.ink400)),
            ]),
          ),
          if (i < _steps.length - 1) const SizedBox(width: 6),
        ],
      ],
    );
  }
}

class _ReviewSheet extends StatefulWidget {
  const _ReviewSheet();

  @override
  State<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends State<_ReviewSheet> {
  int _rating = 0;
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('How did it go?', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  IconButton(
                    iconSize: 38,
                    tooltip: '$i star${i == 1 ? '' : 's'}',
                    onPressed: () => setState(() => _rating = i),
                    icon: Icon(i <= _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                        color: i <= _rating ? Palette.primary500 : Palette.ink300),
                  ),
              ],
            ),
            TextField(
              controller: _text,
              maxLines: 3,
              maxLength: 1500,
              decoration: const InputDecoration(hintText: 'Share details (optional)'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _rating == 0
                  ? null
                  : () => Navigator.pop(context, {
                        'rating': _rating,
                        if (_text.text.trim().isNotEmpty) 'text': _text.text.trim(),
                      }),
              child: const Text('Submit review'),
            ),
          ],
        ),
      );
}
