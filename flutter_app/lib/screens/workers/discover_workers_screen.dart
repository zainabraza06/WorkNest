import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';
import '../../widgets/paged_list.dart';
import '../../widgets/transitions.dart';
import 'worker_profile_screen.dart';

/// Client-facing worker search. Free text uses the AI "smart" ranking (describe a problem, get
/// the right trade); the backend transparently falls back to keyword search if the AI service
/// is asleep, and tells us via `degraded` so we can say so instead of looking like a bad matcher.
class DiscoverWorkersScreen extends StatefulWidget {
  const DiscoverWorkersScreen({super.key});

  @override
  State<DiscoverWorkersScreen> createState() => _DiscoverWorkersScreenState();
}

class _DiscoverWorkersScreenState extends State<DiscoverWorkersScreen> {
  final _search = TextEditingController();
  final _list = GlobalKey<PagedListState>();
  Timer? _debounce;
  String _q = '';
  String? _category;
  String? _city;
  bool _verified = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _filters() async {
    String? city = _city;
    bool verified = _verified;
    final applied = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(ctx).bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Filters', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 16),
              DropdownButtonFormField<String?>(
                initialValue: city,
                decoration: const InputDecoration(labelText: 'City'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Anywhere')),
                  for (final c in cities.keys) DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (v) => setSheet(() => city = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('ID-verified only'),
                value: verified,
                activeThumbColor: Palette.primary500,
                onChanged: (v) => setSheet(() => verified = v),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Apply')),
            ],
          ),
        ),
      ),
    );
    if (applied == true) {
      setState(() {
        _city = city;
        _verified = verified;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final activeFilters = (_city != null ? 1 : 0) + (_verified ? 1 : 0);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find workers'),
        actions: [
          IconButton(
            tooltip: 'Filters',
            onPressed: _filters,
            icon: Badge(isLabelVisible: activeFilters > 0, label: Text('$activeFilters'), child: const Icon(Icons.tune)),
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  onChanged: (v) {
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 500), () {
                      if (mounted) setState(() => _q = v.trim());
                    });
                  },
                  decoration: const InputDecoration(
                    hintText: 'Describe the problem — "AC not cooling"',
                    prefixIcon: Icon(Icons.auto_awesome_outlined, color: Palette.primary500),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 38,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _Chip('All', _category == null, () => setState(() => _category = null)),
                      for (final c in categories) _Chip(c.label, _category == c.value, () => setState(() => _category = c.value)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: PagedList(
              key: _list,
              queryKey: '$_q|$_category|$_city|$_verified',
              fetch: (page) => repo.searchWorkers({
                'page': page,
                'limit': 10,
                'q': _q,
                'mode': _q.isEmpty ? 'keyword' : 'smart',
                'sort': _q.isEmpty ? 'trust' : 'relevance',
                'category': _category,
                'city': _city,
                if (_verified) 'verified': 'true',
              }),
              empty: const EmptyState(
                icon: Icons.person_search_outlined,
                title: 'No workers found',
                message: 'Try fewer filters or a broader description.',
              ),
              itemBuilder: (context, w) => _WorkerCard(worker: w),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.selected, this.onTap);

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: selected,
          showCheckmark: false,
          labelStyle: TextStyle(color: selected ? Colors.white : Palette.ink700, fontWeight: FontWeight.w600),
          onSelected: (_) => onTap(),
        ),
      );
}

class _WorkerCard extends StatelessWidget {
  const _WorkerCard({required this.worker});

  final Json worker;

  @override
  Widget build(BuildContext context) {
    final user = worker['user'] as Json?;
    final stats = worker['stats'] as Json?;
    final trust = (worker['trustScore'] as Json?);
    final rates = worker['rates'] as Json?;
    final cats = (worker['categories'] as List?)?.cast<String>() ?? const [];
    final reasons = (worker['matchReasons'] as List?)?.cast<String>() ?? const [];
    final rating = (stats?['avgRating'] as num?) ?? 0;

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.of(context).push(pushRoute(WorkerProfileScreen(userId: user?['_id'] as String))),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Avatar(name: (user?['name'] as String?) ?? '?', url: (user?['avatar'] as Json?)?['url'] as String?, size: 52),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text((user?['name'] as String?) ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium)),
                      if (worker['idVerified'] == true) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.verified, size: 17, color: Palette.primary500),
                      ],
                    ]),
                    Text((worker['headline'] as String?) ?? cats.map((c) => categoryMap[c]?.label ?? c).join(', '),
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ),
                if (trust != null) _TrustPill(score: (trust['score'] as num).toInt(), label: trust['label'] as String? ?? ''),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                const Icon(Icons.star_rounded, size: 18, color: Palette.primary500),
                const SizedBox(width: 3),
                Text(rating == 0 ? 'New' : rating.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w700)),
                if ((stats?['reviewCount'] as num?) != null && (stats!['reviewCount'] as num) > 0)
                  Text(' (${stats['reviewCount']})', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(width: 12),
                const Icon(Icons.place_outlined, size: 16, color: Palette.ink500),
                Text(worker['city'] as String? ?? '', style: Theme.of(context).textTheme.bodySmall),
                const Spacer(),
                Text('${formatPKR(rates?['daily'] as num?)}/day', style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.ink950)),
              ]),
              if (reasons.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final r in reasons.take(2))
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: Palette.primary50, borderRadius: BorderRadius.circular(8)),
                      child: Text(r, style: const TextStyle(fontSize: 12, color: Palette.primary700, fontWeight: FontWeight.w600)),
                    ),
                ]),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TrustPill extends StatelessWidget {
  const _TrustPill({required this.score, required this.label});

  final int score;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: score >= 70 ? Palette.success : Palette.ink300, width: 2.5),
            ),
            child: Text('$score', style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 10, color: Palette.ink500, fontWeight: FontWeight.w600)),
        ],
      );
}
