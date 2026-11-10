import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';
import '../../widgets/paged_list.dart';
import '../../widgets/transitions.dart';
import '../bookings/booking_detail_screen.dart';
import '../jobs/job_detail_screen.dart';
import '../offers/thread_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _list = GlobalKey<PagedListState>();

  /// Notifications carry web paths like /negotiations/:id — map them onto native screens.
  void _open(Json n) {
    final link = (n['link'] as String?) ?? '';
    final parts = link.split('/').where((p) => p.isNotEmpty).toList();
    if (parts.length < 2) return;
    final page = switch (parts[0]) {
      'negotiations' => ThreadScreen(offerId: parts[1]),
      'bookings' => BookingDetailScreen(bookingId: parts[1]),
      'jobs' => JobDetailScreen(jobId: parts[1]),
      _ => null,
    };
    if (page != null) Navigator.of(context).push(pushRoute(page));
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              try {
                await repo.markNotificationsRead();
                _list.currentState?.reset();
              } catch (e) {
                if (context.mounted) showError(context, e);
              }
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: PagedList(
        key: _list,
        queryKey: 'all',
        fetch: (page) => repo.notifications(page: page),
        empty: const EmptyState(icon: Icons.notifications_none_rounded, title: "You're all caught up", message: 'New activity will appear here.'),
        itemBuilder: (context, n) {
          final unread = n['readAt'] == null;
          return Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () {
                if (unread) repo.markNotificationsRead(n['_id'] as String).catchError((_) => <String, dynamic>{});
                _open(n);
              },
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    margin: const EdgeInsets.only(top: 6, right: 10),
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: unread ? Palette.primary500 : Colors.transparent, shape: BoxShape.circle),
                  ),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n['title'] as String, style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w600, color: Palette.ink950)),
                      if ((n['body'] as String?)?.isNotEmpty ?? false) ...[
                        const SizedBox(height: 2),
                        Text(n['body'] as String, style: Theme.of(context).textTheme.bodyMedium),
                      ],
                      const SizedBox(height: 4),
                      Text(timeAgo(n['createdAt']), style: Theme.of(context).textTheme.bodySmall),
                    ]),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }
}
