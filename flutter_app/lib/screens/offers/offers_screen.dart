import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/paged_list.dart';
import '../../widgets/transitions.dart';
import 'thread_screen.dart';

/// Negotiation inbox: every offer thread the user is in, newest activity first, with the
/// "your turn" and unread cues the web Offers page shows.
class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  String _filter = 'pending';
  final _list = GlobalKey<PagedListState>();

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final auth = context.read<AuthState>();
    return Scaffold(
      appBar: AppBar(title: const Text('Offers')),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            width: double.infinity,
            child: SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'pending', label: Text('Active')),
                ButtonSegment(value: 'accepted', label: Text('Accepted')),
                ButtonSegment(value: 'rejected,withdrawn,closed', label: Text('Closed')),
              ],
              selected: {_filter},
              onSelectionChanged: (s) => setState(() => _filter = s.first),
              style: SegmentedButton.styleFrom(
                selectedBackgroundColor: Palette.ink950,
                selectedForegroundColor: Colors.white,
              ),
            ),
          ),
          Expanded(
            child: PagedList(
              key: _list,
              queryKey: _filter,
              fetch: (page) => repo.offers({'status': _filter, 'page': page, 'limit': 15}),
              empty: const EmptyState(
                icon: Icons.forum_outlined,
                title: 'No offers here',
                message: 'Offers and counter-offers you exchange will appear in this list.',
              ),
              itemBuilder: (context, offer) => _OfferTile(offer: offer, isWorker: auth.isWorker, onReturn: () => _list.currentState?.reset()),
            ),
          ),
        ],
      ),
    );
  }
}

class _OfferTile extends StatelessWidget {
  const _OfferTile({required this.offer, required this.isWorker, required this.onReturn});

  final Json offer;
  final bool isWorker;
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final other = (isWorker ? offer['client'] : offer['worker']) as Json?;
    final job = offer['job'] as Json?;
    final rounds = (offer['rounds'] as List?) ?? const [];
    final current = rounds.isEmpty ? null : rounds.last as Json;
    final unread = (offer['unreadCount'] as num?)?.toInt() ?? 0;
    final myTurn = offer['status'] == 'pending' && offer['awaitingRole'] == (isWorker ? 'worker' : 'client');

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Navigator.of(context).push(pushRoute(ThreadScreen(offerId: offer['_id'] as String)));
          onReturn();
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Avatar(name: (other?['name'] as String?) ?? '?', url: (other?['avatar'] as Json?)?['url'] as String?),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text((job?['title'] as String?) ?? 'Job',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text('${other?['name'] ?? ''} · ${timeAgo(offer['lastActivityAt'])}',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 6),
                    Row(children: [
                      Text(formatPKR(current?['amount'] as num?),
                          style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.ink950)),
                      const SizedBox(width: 8),
                      if (myTurn) const StatusBadge('Your turn', Tone.solid) else _statusBadge(offer['status'] as String),
                    ]),
                  ],
                ),
              ),
              if (unread > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Palette.primary500, borderRadius: BorderRadius.circular(999)),
                  child: Text('$unread', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusBadge(String status) => switch (status) {
        'pending' => const StatusBadge('Waiting', Tone.neutral),
        'accepted' => const StatusBadge('Accepted', Tone.success),
        'rejected' => const StatusBadge('Declined', Tone.danger),
        'withdrawn' => const StatusBadge('Withdrawn', Tone.neutral),
        _ => const StatusBadge('Closed', Tone.neutral),
      };
}
