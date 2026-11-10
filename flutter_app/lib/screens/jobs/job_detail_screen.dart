import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../offers/offer_form_screen.dart';
import '../offers/thread_screen.dart';

class JobDetailScreen extends StatelessWidget {
  const JobDetailScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return Scaffold(
      appBar: AppBar(title: const Text('Job details')),
      body: AsyncLoader<Json>(
        load: () => repo.job(jobId),
        skeleton: const ListSkeleton(count: 2),
        builder: (context, job, refresh) => _JobBody(job: job, onChanged: refresh),
      ),
    );
  }
}

class _JobBody extends StatefulWidget {
  const _JobBody({required this.job, required this.onChanged});

  final Json job;
  final Future<void> Function() onChanged;

  @override
  State<_JobBody> createState() => _JobBodyState();
}

class _JobBodyState extends State<_JobBody> {
  bool _busy = false;

  Json get job => widget.job;

  Future<void> _cancel() async {
    final reason = await _askReason(context, 'Cancel this job?', 'Workers who sent offers will be notified.');
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<Repository>().cancelJob(job['_id'] as String, reason);
      if (!mounted) return;
      await widget.onChanged();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendOffer() async {
    final offer = await Navigator.of(context).push<Json>(pushRoute(OfferFormScreen.create(job: job)));
    if (offer == null || !mounted) return;
    await Navigator.of(context).push(pushRoute(ThreadScreen(offerId: offer['_id'] as String)));
    if (mounted) widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final cat = categoryMap[job['category']];
    final client = job['client'] as Json?;
    final isOwner = auth.isClient && client?['_id'] == auth.userId;
    final myOffer = job['myOffer'] as Json?;
    final open = const ['posted', 'negotiating'].contains(job['status']);
    final skills = (job['skills'] as List?)?.cast<String>() ?? const [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [
          StatusBadge.job(job['status'] as String),
          const SizedBox(width: 8),
          if (job['urgency'] == 'urgent') const StatusBadge('Urgent', Tone.danger),
        ]),
        const SizedBox(height: 12),
        Text(job['title'] as String, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 6),
        Row(children: [
          Icon(cat?.icon ?? Icons.build_outlined, size: 16, color: Palette.primary600),
          const SizedBox(width: 6),
          Text(cat?.label ?? '', style: const TextStyle(fontWeight: FontWeight.w700, color: Palette.primary700)),
          const SizedBox(width: 10),
          Text('Posted ${timeAgo(job['createdAt'])}', style: Theme.of(context).textTheme.bodySmall),
        ]),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              InfoRow('Budget', formatBudget(job['budget'] as Json?)),
              InfoRow('Duration', formatDuration(job['durationType'] as String?, (job['durationCount'] as num?)?.toInt() ?? 1)),
              InfoRow('Starts', formatDate(job['startDate'])),
              InfoRow('Location', [job['city'], job['address']].where((e) => e != null && '$e'.isNotEmpty).join(' · ')),
              InfoRow('Urgency', urgencies[job['urgency']] ?? '—'),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        Text('Description', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(job['description'] as String),
        if (skills.isNotEmpty) ...[
          const SizedBox(height: 16),
          Wrap(spacing: 8, runSpacing: 8, children: [for (final s in skills) Chip(label: Text(s))]),
        ],
        const SizedBox(height: 20),
        Card(
          child: ListTile(
            leading: Avatar(name: (client?['name'] as String?) ?? '?', url: (client?['avatar'] as Json?)?['url'] as String?),
            title: Text((client?['name'] as String?) ?? 'Client', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('Member since ${formatDate(client?['createdAt'])}'),
          ),
        ),
        const SizedBox(height: 24),
        if (auth.isWorker && open && myOffer == null)
          LoadingButton(label: 'Send an offer', icon: Icons.send_rounded, accent: true, onPressed: _sendOffer),
        if (auth.isWorker && myOffer != null)
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(pushRoute(ThreadScreen(offerId: myOffer['_id'] as String))),
            icon: const Icon(Icons.forum_outlined),
            label: const Text('View your offer'),
          ),
        if (isOwner && open)
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Palette.danger),
            onPressed: _busy ? null : _cancel,
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Cancel job'),
          ),
      ],
    );
  }
}

/// Asks for an optional reason. Returns null if dismissed, '' if confirmed without a reason.
Future<String?> _askReason(BuildContext context, String title, String message) {
  final c = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(message),
        const SizedBox(height: 12),
        TextField(controller: c, maxLength: 300, maxLines: 2, decoration: const InputDecoration(hintText: 'Reason (optional)')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep')),
        TextButton(
          onPressed: () => Navigator.pop(ctx, c.text.trim()),
          style: TextButton.styleFrom(foregroundColor: Palette.danger),
          child: const Text('Confirm'),
        ),
      ],
    ),
  );
}

Future<String?> askReason(BuildContext context, String title, String message) => _askReason(context, title, message);
