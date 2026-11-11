import 'package:intl/intl.dart';

final _pkr = NumberFormat.decimalPattern('en_PK');

/// 25000 -> "Rs 25,000"
String formatPKR(num? amount) => amount == null ? '—' : 'Rs ${_pkr.format(amount.round())}';

String formatBudget(Map<String, dynamic>? b) {
  if (b == null) return '—';
  final min = b['min'] as num?, max = b['max'] as num?;
  return min == max ? formatPKR(min) : '${formatPKR(min)} – ${formatPKR(max)}';
}

String formatDate(dynamic d) {
  final date = d == null ? null : DateTime.tryParse('$d')?.toLocal();
  return date == null ? '—' : DateFormat('d MMM y').format(date);
}

String timeAgo(dynamic d) {
  final date = d == null ? null : DateTime.tryParse('$d')?.toLocal();
  if (date == null) return '';
  final diff = DateTime.now().difference(date);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 30) return '${diff.inDays}d ago';
  return formatDate(d);
}

String formatDuration(String? type, [int count = 1]) {
  const units = {'one_day': 'day', 'weekly': 'week', 'monthly': 'month'};
  final unit = units[type];
  return unit == null ? '' : '$count $unit${count == 1 ? '' : 's'}';
}

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
  return parts.map((p) => p[0].toUpperCase()).join();
}

String titleCase(String snake) => snake
    .split('_')
    .where((p) => p.isNotEmpty)
    .map((p) => p[0].toUpperCase() + p.substring(1))
    .join(' ');

/// "1 offer", "2 offers": the count with a correctly pluralised noun.
String countOf(num n, String singular, [String? plural]) =>
    '${n.toInt()} ${n == 1 ? singular : (plural ?? '${singular}s')}';
