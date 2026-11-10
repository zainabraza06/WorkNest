import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';

/// Worker balance, payout method and withdrawal history. All figures are derived server-side
/// from the payment ledger — the app only displays them.
class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  final _loader = GlobalKey<AsyncLoaderState<Json>>();

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: AsyncLoader<Json>(
        key: _loader,
        load: repo.earnings,
        skeleton: const ListSkeleton(count: 3),
        builder: (context, e, refresh) {
          final payments = (e['payments'] as List?)?.cast<Json>() ?? const [];
          final withdrawals = (e['withdrawals'] as List?)?.cast<Json>() ?? const [];
          final method = e['payoutMethod'] as Json?;
          final available = (e['available'] as num?) ?? 0;
          final min = (e['minWithdrawal'] as num?) ?? 0;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Palette.ink950, borderRadius: BorderRadius.circular(18)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Available to withdraw', style: TextStyle(color: Palette.ink400)),
                  const SizedBox(height: 6),
                  Text(formatPKR(available), style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1)),
                  const SizedBox(height: 16),
                  Row(children: [
                    _Mini('In escrow', formatPKR(e['inEscrow'] as num?)),
                    _Mini('Requested', formatPKR(e['requested'] as num?)),
                    _Mini('Paid out', formatPKR(e['paid'] as num?)),
                  ]),
                  const SizedBox(height: 18),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Palette.primary500),
                    onPressed: available >= min && method != null ? () => _withdraw(available, min, refresh) : null,
                    child: Text(method == null
                        ? 'Add a payout method first'
                        : available < min
                            ? 'Minimum withdrawal ${formatPKR(min)}'
                            : 'Withdraw'),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.account_balance_outlined),
                  title: Text(method == null ? 'No payout method' : '${_methodName(method['type'] as String)} · ${method['accountTitle']}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(method == null ? 'Add where we should send your money' : '${method['accountNumber']}'),
                  trailing: TextButton(onPressed: () => _editMethod(method, refresh), child: Text(method == null ? 'Add' : 'Edit')),
                ),
              ),
              const SizedBox(height: 24),
              Text('Recent payments', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              if (payments.isEmpty)
                const SizedBox(height: 160, child: EmptyState(icon: Icons.payments_outlined, title: 'No payments yet', message: 'Completed jobs show up here.'))
              else
                for (final p in payments)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: p['status'] == 'released' ? const Color(0xFFDCFCE7) : Palette.ink100,
                      child: Icon(p['status'] == 'released' ? Icons.south_west_rounded : Icons.lock_clock_outlined,
                          color: p['status'] == 'released' ? Palette.success : Palette.ink500),
                    ),
                    title: Text((((p['booking'] as Json?)?['job'] as Json?)?['title'] as String?) ?? 'Job payment', maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text(p['status'] == 'held' ? 'Held in escrow' : formatDate(p['releasedAt'])),
                    trailing: Text('+${formatPKR(p['workerPayout'] as num?)}', style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.success)),
                  ),
              if (withdrawals.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('Withdrawals', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                for (final w in withdrawals)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(backgroundColor: Palette.ink100, child: Icon(Icons.north_east_rounded, color: Palette.ink700)),
                    title: Text(formatPKR(w['amount'] as num?), style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(formatDate(w['requestedAt'])),
                    trailing: StatusBadge(
                      titleCase('${w['status']}'),
                      switch (w['status']) { 'paid' => Tone.success, 'rejected' => Tone.danger, _ => Tone.warning },
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  String _methodName(String type) => switch (type) { 'bank' => 'Bank', 'easypaisa' => 'Easypaisa', 'jazzcash' => 'JazzCash', _ => titleCase(type) };

  Future<void> _withdraw(num available, num min, Future<void> Function() refresh) async {
    final c = TextEditingController(text: available.round().toString());
    final amount = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw'),
        content: TextField(
          controller: c,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: 'Amount (PKR)', prefixText: 'Rs ', helperText: 'Between ${formatPKR(min)} and ${formatPKR(available)}'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(110, 44)),
            onPressed: () {
              final n = int.tryParse(c.text);
              if (n != null && n >= min && n <= available) Navigator.pop(ctx, n);
            },
            child: const Text('Request'),
          ),
        ],
      ),
    );
    if (amount == null || !mounted) return;
    try {
      await context.read<Repository>().requestWithdrawal(amount);
      if (!mounted) return;
      showInfo(context, 'Withdrawal requested');
      await refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _editMethod(Json? current, Future<void> Function() refresh) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PayoutSheet(current: current),
    );
    if (saved == true) await refresh();
  }
}

class _Mini extends StatelessWidget {
  const _Mini(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: Palette.ink400, fontSize: 12)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      );
}

class _PayoutSheet extends StatefulWidget {
  const _PayoutSheet({this.current});

  final Json? current;

  @override
  State<_PayoutSheet> createState() => _PayoutSheetState();
}

class _PayoutSheetState extends State<_PayoutSheet> {
  late String _type = (widget.current?['type'] as String?) ?? 'easypaisa';
  late final _title = TextEditingController(text: widget.current?['accountTitle'] as String?);
  late final _number = TextEditingController();
  late final _bank = TextEditingController(text: widget.current?['bankName'] as String?);
  final _form = GlobalKey<FormState>();
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _number.dispose();
    _bank.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await context.read<Repository>().setPayoutMethod({
        'type': _type,
        'accountTitle': _title.text.trim(),
        'accountNumber': _number.text.trim(),
        if (_type == 'bank') 'bankName': _bank.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Payout method', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 'easypaisa', label: Text('Easypaisa')),
                  ButtonSegment(value: 'jazzcash', label: Text('JazzCash')),
                  ButtonSegment(value: 'bank', label: Text('Bank')),
                ],
                selected: {_type},
                onSelectionChanged: (s) => setState(() => _type = s.first),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _title,
                decoration: const InputDecoration(labelText: 'Name on the account'),
                validator: (v) => (v == null || v.trim().length < 3) ? 'Enter the name on the account' : null,
              ),
              if (_type == 'bank') ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _bank,
                  decoration: const InputDecoration(labelText: 'Bank name'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Which bank?' : null,
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(
                controller: _number,
                keyboardType: TextInputType.text,
                decoration: InputDecoration(
                  labelText: _type == 'bank' ? 'IBAN / account number' : 'Wallet mobile number',
                  helperText: widget.current == null ? null : 'Re-enter to change (stored masked)',
                ),
                validator: (v) => (v == null || v.trim().length < 10) ? 'Enter the full number' : null,
              ),
              const SizedBox(height: 18),
              LoadingButton(label: 'Save', loading: _busy, onPressed: _save),
            ]),
          ),
        ),
      );
}
