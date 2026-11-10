import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/paged_list.dart';
import '../../widgets/transitions.dart';
import 'booking_detail_screen.dart';

class BookingsScreen extends StatefulWidget {
  const BookingsScreen({super.key});

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  String _filter = 'pending_payment,confirmed,in_progress,disputed';
  final _list = GlobalKey<PagedListState>();

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final isWorker = context.read<AuthState>().isWorker;
    return Scaffold(
      appBar: AppBar(title: const Text('Bookings')),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'pending_payment,confirmed,in_progress,disputed', label: Text('Active')),
                ButtonSegment(value: 'completed', label: Text('Completed')),
                ButtonSegment(value: 'cancelled', label: Text('Cancelled')),
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
              fetch: (page) => repo.bookings({'status': _filter, 'page': page, 'limit': 12}),
              empty: const EmptyState(
                icon: Icons.event_busy_outlined,
                title: 'No bookings here',
                message: 'When an offer is accepted it becomes a booking you can track.',
              ),
              itemBuilder: (context, b) => _BookingCard(
                booking: b,
                isWorker: isWorker,
                onReturn: () => _list.currentState?.reset(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking, required this.isWorker, required this.onReturn});

  final Json booking;
  final bool isWorker;
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final job = booking['job'] as Json?;
    final other = (isWorker ? booking['client'] : booking['worker']) as Json?;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Navigator.of(context).push(pushRoute(BookingDetailScreen(bookingId: booking['_id'] as String)));
          onReturn();
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(
                  child: Text((job?['title'] as String?) ?? 'Job',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                ),
                const SizedBox(width: 8),
                StatusBadge.booking(booking['status'] as String),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Avatar(name: (other?['name'] as String?) ?? '?', url: (other?['avatar'] as Json?)?['url'] as String?, size: 28),
                const SizedBox(width: 8),
                Expanded(child: Text((other?['name'] as String?) ?? '', style: Theme.of(context).textTheme.bodyMedium)),
                Text(formatPKR(booking['agreedPrice'] as num?),
                    style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.ink950)),
              ]),
              const SizedBox(height: 8),
              Text(
                '${formatDate(booking['startDate'])} → ${formatDate(booking['endDate'])}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
