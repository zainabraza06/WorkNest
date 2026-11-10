import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../bookings/booking_detail_screen.dart';
import '../jobs/job_detail_screen.dart' show askReason;
import 'offer_form_screen.dart';

/// One negotiation: the terms currently on the table, the round history, a chat, and the
/// actions the current user is allowed (accept / counter / decline / withdraw).
///
/// New messages arrive by polling every few seconds while the screen is open; the web client
/// gets the same events over Socket.io.
class ThreadScreen extends StatefulWidget {
  const ThreadScreen({super.key, required this.offerId});

  final String offerId;

  @override
  State<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<ThreadScreen> {
  late final Repository _repo = context.read<Repository>();
  final _composer = TextEditingController();
  final _scroll = ScrollController();
  Json? _offer;
  List<Json> _messages = [];
  Object? _error;
  bool _busy = false;
  bool _sending = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load(initial: true);
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _composer.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool initial = false}) async {
    try {
      final results = await Future.wait([_repo.offer(widget.offerId), _repo.messages(widget.offerId)]);
      if (!mounted) return;
      final fresh = ((results[1]['items'] as List?) ?? const []).cast<Json>();
      final grew = fresh.length != _messages.length;
      setState(() {
        _offer = results[0];
        _messages = fresh;
        _error = null;
      });
      if (initial || grew) {
        _repo.markOfferRead(widget.offerId).catchError((_) {});
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
        });
      }
    } catch (e) {
      if (mounted && _offer == null) setState(() => _error = e);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    final text = _composer.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _repo.sendMessage(widget.offerId, text);
      _composer.clear();
      await _load();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(_scroll.position.maxScrollExtent,
              duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
        }
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _accept() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Accept these terms?'),
        content: const Text('This creates a booking. The client then pays into escrow before work starts.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not yet')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(minimumSize: const Size(100, 44)),
            child: const Text('Accept'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await _repo.acceptOffer(widget.offerId);
      final booking = result['booking'] as Json?;
      if (!mounted) return;
      if (booking != null) {
        await Navigator.of(context).push(pushRoute(BookingDetailScreen(bookingId: booking['_id'] as String)));
      }
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _counter() async {
    final offer = _offer!;
    final current = (offer['rounds'] as List).last as Json;
    final job = offer['job'] as Json?;
    final result = await Navigator.of(context).push<Json>(pushRoute(OfferFormScreen.counter(
      offerId: widget.offerId,
      durationType: current['durationType'] as String,
      amount: current['amount'] as num,
      durationCount: (current['durationCount'] as num).toInt(),
      startDate: DateTime.parse('${current['startDate']}'),
      category: job?['category'] as String?,
      city: job?['city'] as String?,
    )));
    if (result != null) await _load();
  }

  Future<void> _decline(bool isWorker, bool myTurn) async {
    final withdraw = isWorker && !myTurn;
    final reason = await askReason(
      context,
      withdraw ? 'Withdraw your offer?' : 'Decline this offer?',
      'The other person will be notified.',
    );
    if (reason == null) return;
    await _run(() async {
      if (withdraw) {
        await _repo.withdrawOffer(widget.offerId, reason);
      } else {
        await _repo.rejectOffer(widget.offerId, reason);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthState>();
    final offer = _offer;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          offer == null ? 'Negotiation' : ((offer['job'] as Json?)?['title'] as String? ?? 'Negotiation'),
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: offer == null
          ? (_error != null ? ErrorState(error: _error!, onRetry: () => _load(initial: true)) : const ListSkeleton(count: 3))
          : _buildBody(context, offer, auth),
    );
  }

  Widget _buildBody(BuildContext context, Json offer, AuthState auth) {
    final rounds = (offer['rounds'] as List).cast<Json>();
    final current = rounds.last;
    final status = offer['status'] as String;
    final myTurn = offer['isMyTurn'] == true;
    final pending = status == 'pending';
    final other = (auth.isWorker ? offer['client'] : offer['worker']) as Json?;
    final summary = offer['workerSummary'] as Json?;
    final booking = offer['booking'] as Json?;
    final roundIndex = {for (var i = 0; i < rounds.length; i++) rounds[i]['_id']: i + 1};

    return Column(
      children: [
        Expanded(
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Avatar(name: (other?['name'] as String?) ?? '?', url: (other?['avatar'] as Json?)?['url'] as String?),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text((other?['name'] as String?) ?? '', style: Theme.of(context).textTheme.titleMedium),
                            if (auth.isClient && summary != null)
                              Text(
                                '${summary['headline'] ?? 'Worker'}'
                                '${(summary['trustScore'] != null) ? ' · Trust ${summary['trustScore']}' : ''}',
                                style: Theme.of(context).textTheme.bodySmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                          ]),
                        ),
                        _statusBadge(status, myTurn),
                      ]),
                      const Divider(height: 28),
                      Text(pending ? 'ON THE TABLE' : 'LATEST TERMS',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.1, color: Palette.primary600)),
                      const SizedBox(height: 4),
                      Text(formatPKR(current['amount'] as num?),
                          style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -1, color: Palette.ink950)),
                      const SizedBox(height: 8),
                      InfoRow('Duration', formatDuration(current['durationType'] as String?, (current['durationCount'] as num).toInt())),
                      InfoRow('Starts', formatDate(current['startDate'])),
                      if ((current['terms'] as String?)?.isNotEmpty ?? false) InfoRow('Terms', current['terms'] as String),
                    ],
                  ),
                ),
              ),
              if (pending) ...[
                const SizedBox(height: 12),
                if (myTurn) ...[
                  LoadingButton(label: 'Accept ${formatPKR(current['amount'] as num?)}', loading: _busy, onPressed: _accept, accent: true),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(child: OutlinedButton(onPressed: _busy ? null : _counter, child: const Text('Counter'))),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(foregroundColor: Palette.danger),
                        onPressed: _busy ? null : () => _decline(auth.isWorker, true),
                        child: const Text('Decline'),
                      ),
                    ),
                  ]),
                ] else if (auth.isWorker)
                  OutlinedButton(onPressed: _busy ? null : () => _decline(true, false), child: const Text('Withdraw offer'))
                else
                  const Center(child: Text('Waiting for the worker to respond…')),
              ],
              if (status == 'accepted' && booking != null) ...[
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context)
                      .push(pushRoute(BookingDetailScreen(bookingId: booking['_id'] as String))),
                  icon: const Icon(Icons.event_available_outlined),
                  label: const Text('Open booking'),
                ),
              ],
              const SizedBox(height: 20),
              for (final m in _messages) _MessageRow(message: m, mine: m['sender'] == auth.userId, roundIndex: roundIndex, rounds: rounds),
            ],
          ),
        ),
        if (pending || status == 'accepted')
          SafeArea(
            top: false,
            child: Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _composer,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 2000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(hintText: 'Message…', counterText: '', isDense: true),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton.filled(
                  onPressed: _sending ? null : _send,
                  style: IconButton.styleFrom(backgroundColor: Palette.primary500),
                  icon: _sending
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded),
                ),
              ]),
            ),
          ),
      ],
    );
  }

  Widget _statusBadge(String status, bool myTurn) {
    if (status == 'pending') return myTurn ? const StatusBadge('Your turn', Tone.solid) : const StatusBadge('Waiting', Tone.neutral);
    return switch (status) {
      'accepted' => const StatusBadge('Accepted', Tone.success),
      'rejected' => const StatusBadge('Declined', Tone.danger),
      'withdrawn' => const StatusBadge('Withdrawn', Tone.neutral),
      _ => const StatusBadge('Closed', Tone.neutral),
    };
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({required this.message, required this.mine, required this.roundIndex, required this.rounds});

  final Json message;
  final bool mine;
  final Map<dynamic, int> roundIndex;
  final List<Json> rounds;

  @override
  Widget build(BuildContext context) {
    final type = message['type'];
    final text = (message['text'] as String?) ?? '';

    if (type == 'system') {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Center(child: Text(text, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center)),
      );
    }

    if (type == 'offer') {
      final round = rounds.cast<Json?>().firstWhere((r) => r?['_id'] == message['roundId'], orElse: () => null);
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Palette.ink100,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Palette.ink200),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              'ROUND ${roundIndex[message['roundId']] ?? ''} · ${mine ? 'YOU' : 'THEM'} · ${timeAgo(message['createdAt'])}',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Palette.ink500),
            ),
            const SizedBox(height: 4),
            Text(formatPKR(round?['amount'] as num?), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            if (text.isNotEmpty) ...[const SizedBox(height: 4), Text(text)],
          ]),
        ),
      );
    }

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        decoration: BoxDecoration(
          color: mine ? Palette.ink950 : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: mine ? null : Border.all(color: Palette.ink200),
        ),
        child: Text(text, style: TextStyle(color: mine ? Colors.white : Palette.ink900)),
      ),
    );
  }
}
