import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../jobs/post_job_screen.dart';

class WorkerProfileScreen extends StatelessWidget {
  const WorkerProfileScreen({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final isClient = context.read<AuthState>().isClient;
    return Scaffold(
      appBar: AppBar(title: const Text('Worker')),
      body: AsyncLoader<Json>(
        load: () => repo.worker(userId),
        skeleton: const ListSkeleton(count: 3),
        builder: (context, w, refresh) {
          final user = w['user'] as Json?;
          final stats = w['stats'] as Json?;
          final trust = w['trustScore'] as Json?;
          final rates = w['rates'] as Json?;
          final cats = (w['categories'] as List?)?.cast<String>() ?? const [];
          final skills = (w['skills'] as List?)?.cast<String>() ?? const [];
          final reviews = (w['recentReviews'] as List?)?.cast<Json>() ?? const [];
          final portfolio = (w['portfolio'] as List?)?.cast<Json>() ?? const [];
          final name = (user?['name'] as String?) ?? 'Worker';

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Row(children: [
                      Avatar(name: name, url: (user?['avatar'] as Json?)?['url'] as String?, size: 68),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Flexible(child: Text(name, style: Theme.of(context).textTheme.titleLarge)),
                            if (w['idVerified'] == true) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.verified, color: Palette.primary500, size: 20),
                            ],
                          ]),
                          if (w['headline'] != null) Text(w['headline'] as String, style: Theme.of(context).textTheme.bodyMedium),
                          Text('${w['city'] ?? ''}${(w['experienceYears'] ?? 0) > 0 ? ' · ${w['experienceYears']} yrs experience' : ''}',
                              style: Theme.of(context).textTheme.bodySmall),
                        ]),
                      ),
                    ]),
                    const SizedBox(height: 18),
                    Row(children: [
                      _StatBox('Trust', trust == null ? '—' : '${trust['score']}', trust?['label'] as String?),
                      const SizedBox(width: 10),
                      _StatBox('Rating', (stats?['avgRating'] as num?) == null || stats!['avgRating'] == 0 ? 'New' : (stats['avgRating'] as num).toStringAsFixed(1), '${stats?['reviewCount'] ?? 0} reviews'),
                      const SizedBox(width: 10),
                      _StatBox('Jobs', '${stats?['completedJobs'] ?? 0}', 'completed'),
                    ]),
                    const SizedBox(height: 18),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(children: [
                          InfoRow('Daily rate', formatPKR(rates?['daily'] as num?)),
                          if (rates?['hourly'] != null) InfoRow('Hourly rate', formatPKR(rates!['hourly'] as num?)),
                          if (rates?['monthly'] != null) InfoRow('Monthly rate', formatPKR(rates!['monthly'] as num?)),
                          InfoRow('Availability', w['isAvailable'] == false ? 'Currently unavailable' : 'Available'),
                        ]),
                      ),
                    ),
                    if ((w['bio'] as String?)?.isNotEmpty ?? false) ...[
                      const SizedBox(height: 16),
                      Text('About', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      Text(w['bio'] as String),
                    ],
                    const SizedBox(height: 16),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final c in cats) Chip(avatar: Icon(categoryMap[c]?.icon ?? Icons.build_outlined, size: 16), label: Text(categoryMap[c]?.label ?? c)),
                      // Same rule as the web profile: a skill that just repeats a category label adds nothing.
                      for (final s in skills)
                        if (!cats.any((c) => (categoryMap[c]?.label ?? c).toLowerCase() == s.toLowerCase())) Chip(label: Text(s)),
                    ]),
                    if (portfolio.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Text('Portfolio', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 120,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: portfolio.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (_, i) => ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.network(portfolio[i]['url'] as String, width: 160, height: 120, fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(width: 160, color: Palette.ink100)),
                          ),
                        ),
                      ),
                    ],
                    if (reviews.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Text('Recent reviews', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      for (final r in reviews)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Card(
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  for (var i = 1; i <= 5; i++)
                                    Icon(i <= ((r['rating'] as num?) ?? 0) ? Icons.star_rounded : Icons.star_outline_rounded, size: 18, color: Palette.primary500),
                                  const Spacer(),
                                  Text(timeAgo(r['createdAt']), style: Theme.of(context).textTheme.bodySmall),
                                ]),
                                if ((r['text'] as String?)?.isNotEmpty ?? false) ...[const SizedBox(height: 6), Text(r['text'] as String)],
                              ]),
                            ),
                          ),
                        ),
                    ],
                  ],
                ),
              ),
              if (isClient)
                SafeArea(
                  top: false,
                  child: Container(
                    color: Colors.white,
                    padding: const EdgeInsets.all(12),
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Palette.primary500),
                      onPressed: () => Navigator.of(context).push(pushRoute(PostJobScreen(
                        invitedWorkerId: userId,
                        invitedWorkerName: name.split(' ').first,
                        presetCategory: cats.isEmpty ? null : cats.first,
                        presetCity: w['city'] as String?,
                      ))),
                      icon: const Icon(Icons.handshake_outlined),
                      label: Text('Hire ${name.split(' ').first}'),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox(this.label, this.value, this.caption);

  final String label;
  final String value;
  final String? caption;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Column(children: [
              Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: Palette.ink500)),
              const SizedBox(height: 4),
              Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Palette.ink950)),
              if (caption != null) Text(caption!, style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
        ),
      );
}
