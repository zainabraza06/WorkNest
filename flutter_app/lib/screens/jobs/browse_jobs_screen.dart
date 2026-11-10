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
import 'job_detail_screen.dart';

/// Worker-facing job board: search, category chips and a sort menu over GET /jobs.
class BrowseJobsScreen extends StatefulWidget {
  const BrowseJobsScreen({super.key});

  @override
  State<BrowseJobsScreen> createState() => _BrowseJobsScreenState();
}

class _BrowseJobsScreenState extends State<BrowseJobsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';
  String? _category;
  String _sort = 'newest';

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () {
      if (mounted) setState(() => _q = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find jobs'),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Sort',
            icon: const Icon(Icons.sort),
            initialValue: _sort,
            onSelected: (v) => setState(() => _sort = v),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'newest', child: Text('Newest')),
              PopupMenuItem(value: 'budget_high', child: Text('Highest budget')),
              PopupMenuItem(value: 'budget_low', child: Text('Lowest budget')),
            ],
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
                  onChanged: _onSearch,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search jobs — "fix leaking pipe"',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () {
                              _search.clear();
                              setState(() => _q = '');
                            },
                          ),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 38,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _FilterChip('All', _category == null, () => setState(() => _category = null)),
                      for (final c in categories)
                        _FilterChip(c.label, _category == c.value, () => setState(() => _category = c.value)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: PagedList(
              queryKey: '$_q|$_category|$_sort',
              fetch: (page) => repo.jobs({
                'page': page,
                'limit': 12,
                'q': _q,
                'category': _category,
                'sort': _q.isNotEmpty && _sort == 'newest' ? 'relevance' : _sort,
              }),
              empty: const EmptyState(
                icon: Icons.search_off_rounded,
                title: 'No jobs match',
                message: 'Try a different search or category.',
              ),
              itemBuilder: (context, job) => JobCard(job: job),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip(this.label, this.selected, this.onTap);

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
          labelStyle: TextStyle(
            color: selected ? Colors.white : Palette.ink700,
            fontWeight: FontWeight.w600,
          ),
          onSelected: (_) => onTap(),
        ),
      );
}

class JobCard extends StatelessWidget {
  const JobCard({super.key, required this.job});

  final Json job;

  @override
  Widget build(BuildContext context) {
    final cat = categoryMap[job['category']];
    final client = job['client'] as Json?;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.of(context).push(pushRoute(JobDetailScreen(jobId: job['_id'] as String))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(cat?.icon ?? Icons.build_outlined, size: 18, color: Palette.primary600),
                  const SizedBox(width: 6),
                  Text(cat?.label ?? 'Other',
                      style: const TextStyle(color: Palette.primary700, fontWeight: FontWeight.w700, fontSize: 13)),
                  const Spacer(),
                  if (job['urgency'] == 'urgent') const StatusBadge('Urgent', Tone.danger),
                ],
              ),
              const SizedBox(height: 10),
              Text(job['title'] as String, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              Text(job['description'] as String,
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(formatBudget(job['budget'] as Json?),
                      style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.ink950)),
                  const Spacer(),
                  const Icon(Icons.place_outlined, size: 15, color: Palette.ink500),
                  const SizedBox(width: 2),
                  Text(job['city'] as String? ?? '', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
              const Divider(height: 22),
              Row(
                children: [
                  Avatar(
                      name: (client?['name'] as String?) ?? '?',
                      url: (client?['avatar'] as Json?)?['url'] as String?,
                      size: 24),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${client?['name'] ?? 'Client'} · ${timeAgo(job['createdAt'])}',
                      style: Theme.of(context).textTheme.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text('${job['offersCount'] ?? 0} offers', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
