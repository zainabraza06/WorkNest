import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../services/api_client.dart';
import 'common.dart';

/// Infinite-scrolling list over the API's `{ items, page, totalPages }` pagination envelope.
///
/// Change [queryKey] to reset and reload (e.g. when a filter changes). Pull-to-refresh and the
/// retry state are built in so each list screen only describes its rows.
class PagedList extends StatefulWidget {
  const PagedList({
    super.key,
    required this.queryKey,
    required this.fetch,
    required this.itemBuilder,
    required this.empty,
    this.header,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 24),
  });

  final Object queryKey;
  final Future<Json> Function(int page) fetch;
  final Widget Function(BuildContext context, Json item) itemBuilder;
  final Widget empty;
  final Widget? header;
  final EdgeInsets padding;

  @override
  State<PagedList> createState() => PagedListState();
}

class PagedListState extends State<PagedList> {
  final _scroll = ScrollController();
  final _items = <Json>[];
  int _page = 0;
  int _totalPages = 1;
  bool _loading = false;
  Object? _error;
  int _generation = 0;
  Json? _lastMeta;

  /// Extra fields from the last response (e.g. `mode`, `degraded`) for headers.
  Json? get meta => _lastMeta;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
    _loadMore();
  }

  @override
  void didUpdateWidget(PagedList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.queryKey != widget.queryKey) reset();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> reset() async {
    _generation++;
    setState(() {
      _items.clear();
      _page = 0;
      _totalPages = 1;
      _error = null;
      _loading = false;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || _page >= _totalPages) return;
    final gen = _generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.fetch(_page + 1);
      if (!mounted || gen != _generation) return; // a newer query superseded this one
      setState(() {
        _items.addAll((data['items'] as List).cast<Json>());
        _page = (data['page'] as num).toInt();
        _totalPages = (data['totalPages'] as num?)?.toInt() ?? 1;
        _lastMeta = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || gen != _generation) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_items.isEmpty && _loading) return const ListSkeleton();
    if (_items.isEmpty && _error != null) return ErrorState(error: _error!, onRetry: reset);

    return RefreshIndicator(
      color: Palette.primary500,
      onRefresh: reset,
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: widget.padding,
        itemCount: (_items.isEmpty ? 1 : _items.length) + 1 + (widget.header != null ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          if (widget.header != null) {
            if (i == 0) return widget.header!;
            i -= 1;
          }
          if (_items.isEmpty) {
            return i == 0 ? SizedBox(height: 360, child: widget.empty) : const SizedBox.shrink();
          }
          if (i < _items.length) return widget.itemBuilder(context, _items[i]);
          if (_error != null) {
            return TextButton.icon(
              onPressed: _loadMore,
              icon: const Icon(Icons.refresh),
              label: const Text('Couldn\'t load more — tap to retry'),
            );
          }
          return _loading
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.4))),
                )
              : const SizedBox.shrink();
        },
      ),
    );
  }
}
