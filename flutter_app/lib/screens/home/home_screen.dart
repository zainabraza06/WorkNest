import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../bookings/booking_detail_screen.dart';
import '../earnings/earnings_screen.dart';
import '../jobs/job_detail_screen.dart';
import '../jobs/post_job_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/worker_profile_form_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onNavigate});

  final void Function(int tab) onNavigate;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final firstName = auth.name.split(' ').first;
    return Scaffold(
      appBar: AppBar(
        title: Text(firstName.isEmpty ? 'Home' : 'Hi, $firstName'),
        actions: const [_NotificationBell(), SizedBox(width: 4)],
      ),
      body: auth.isWorker ? _WorkerHome(onNavigate: onNavigate) : _ClientHome(onNavigate: onNavigate),
    );
  }
}

class _NotificationBell extends StatefulWidget {
  const _NotificationBell();

  @override
  State<_NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<_NotificationBell> {
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<Repository>().notifications();
      if (mounted) setState(() => _unread = (data['unread'] as num?)?.toInt() ?? 0);
    } catch (_) {
      // The badge is decoration; never surface an error for it
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: 'Notifications',
        onPressed: () async {
          await Navigator.of(context).push(pushRoute(const NotificationsScreen()));
          _load();
        },
        icon: Badge(
          isLabelVisible: _unread > 0,
          label: Text(_unread > 9 ? '9+' : '$_unread'),
          backgroundColor: Palette.primary500,
          child: const Icon(Icons.notifications_none_rounded),
        ),
      );
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

class _ClientHome extends StatelessWidget {
  const _ClientHome({required this.onNavigate});

  final void Function(int) onNavigate;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return AsyncLoader<Json>(
      load: () => repo.myJobs({'limit': 6}),
      builder: (context, data, refresh) {
        final jobs = (data['items'] as List).cast<Json>();
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _HeroCard(
              title: 'Need something fixed?',
              subtitle: 'Post a job and get offers from verified workers near you.',
              action: 'Post a job',
              icon: Icons.add_circle_outline,
              onTap: () async {
                final posted = await Navigator.of(context).push<bool>(pushRoute(const PostJobScreen()));
                if (posted == true) refresh();
              },
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => onNavigate(1),
              icon: const Icon(Icons.person_search_outlined),
              label: const Text('Browse workers'),
            ),
            const SizedBox(height: 24),
            Text('Your jobs', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (jobs.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: EmptyState(
                  icon: Icons.assignment_outlined,
                  title: 'No jobs yet',
                  message: 'Jobs you post will show up here with their offers.',
                ),
              )
            else
              for (final job in jobs) ...[
                _JobTile(job: job, onChanged: refresh),
                const SizedBox(height: 10),
              ],
          ],
        );
      },
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({required this.job, required this.onChanged});

  final Json job;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final cat = categoryMap[job['category']];
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Navigator.of(context).push(pushRoute(JobDetailScreen(jobId: job['_id'] as String)));
          onChanged();
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: Palette.primary50, borderRadius: BorderRadius.circular(12)),
                child: Icon(cat?.icon ?? Icons.build_outlined, color: Palette.primary600),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(job['title'] as String,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text('${formatBudget(job['budget'] as Json?)} · ${job['offersCount'] ?? 0} offers',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge.job(job['status'] as String),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------------------------

class _WorkerHome extends StatelessWidget {
  const _WorkerHome({required this.onNavigate});

  final void Function(int) onNavigate;

  Future<Json> _load(Repository repo) async {
    final results = await Future.wait([
      repo.myWorkerProfile(),
      repo.earnings(),
      repo.bookings({'limit': 5, 'status': 'confirmed,in_progress,pending_payment'}),
    ]);
    return {'profile': results[0], 'earnings': results[1], 'bookings': results[2]};
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return AsyncLoader<Json>(
      load: () => _load(repo),
      builder: (context, data, refresh) {
        final profile = data['profile'] as Json?;
        final earnings = data['earnings'] as Json;
        final active = ((data['bookings'] as Json)['items'] as List).cast<Json>();
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (profile == null) ...[
              _HeroCard(
                title: 'Finish your profile',
                subtitle: 'Clients can only find and hire you once your profile is set up.',
                action: 'Set up profile',
                icon: Icons.person_add_alt_1_outlined,
                onTap: () async {
                  final done =
                      await Navigator.of(context).push<bool>(pushRoute(const WorkerProfileFormScreen()));
                  if (done == true) refresh();
                },
              ),
              const SizedBox(height: 16),
            ],
            _EarningsCard(
              earnings: earnings,
              onTap: () => Navigator.of(context).push(pushRoute(const EarningsScreen())),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Palette.primary500),
              onPressed: () => onNavigate(1),
              icon: const Icon(Icons.work_outline),
              label: const Text('Find jobs near you'),
            ),
            const SizedBox(height: 24),
            Text('Active work', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (active.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: EmptyState(
                  icon: Icons.event_available_outlined,
                  title: 'Nothing in progress',
                  message: 'Send offers on jobs — accepted ones become bookings here.',
                ),
              )
            else
              for (final b in active) ...[
                _BookingTile(booking: b, onChanged: refresh),
                const SizedBox(height: 10),
              ],
          ],
        );
      },
    );
  }
}

class _EarningsCard extends StatelessWidget {
  const _EarningsCard({required this.earnings, required this.onTap});

  final Json earnings;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Palette.ink950,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Available to withdraw', style: TextStyle(color: Palette.ink400)),
                const SizedBox(height: 6),
                Text(
                  formatPKR(earnings['available'] as num?),
                  style: const TextStyle(
                      color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -1),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _Stat('In escrow', formatPKR(earnings['inEscrow'] as num?)),
                    const SizedBox(width: 24),
                    _Stat('Total earned', formatPKR(earnings['earned'] as num?)),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Palette.ink400, fontSize: 12)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ],
      );
}

class _BookingTile extends StatelessWidget {
  const _BookingTile({required this.booking, required this.onChanged});

  final Json booking;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final job = booking['job'] as Json?;
    final client = booking['client'] as Json?;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Navigator.of(context).push(pushRoute(BookingDetailScreen(bookingId: booking['_id'] as String)));
          onChanged();
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Avatar(name: (client?['name'] as String?) ?? '?', url: (client?['avatar'] as Json?)?['url'] as String?),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text((job?['title'] as String?) ?? 'Job',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text('${formatPKR(booking['agreedPrice'] as num?)} · ${formatDate(booking['startDate'])}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge.booking(booking['status'] as String),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.title,
    required this.subtitle,
    required this.action,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final String action;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Palette.primary500, Palette.primary600],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
            const SizedBox(height: 6),
            Text(subtitle, style: const TextStyle(color: Colors.white70, height: 1.35)),
            const SizedBox(height: 16),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Palette.ink950,
                minimumSize: const Size(0, 46),
              ),
              onPressed: onTap,
              icon: Icon(icon, size: 20),
              label: Text(action),
            ),
          ],
        ),
      );
}
