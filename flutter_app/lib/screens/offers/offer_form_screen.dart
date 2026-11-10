import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';
import '../../widgets/fair_price_hint.dart';

/// Compose an initial offer on a job, or a counter-offer on a thread. Pops with the saved offer.
class OfferFormScreen extends StatefulWidget {
  const OfferFormScreen._({
    required this.title,
    required this.durationType,
    required this.initialAmount,
    required this.initialCount,
    required this.initialStart,
    this.job,
    this.offerId,
    this.category,
    this.city,
  });

  factory OfferFormScreen.create({required Json job}) => OfferFormScreen._(
        title: 'Send an offer',
        job: job,
        durationType: job['durationType'] as String,
        initialAmount: (job['budget'] as Json)['max'] as num,
        initialCount: (job['durationCount'] as num?)?.toInt() ?? 1,
        initialStart: DateTime.tryParse('${job['startDate']}')?.toLocal() ?? DateTime.now(),
        category: job['category'] as String?,
        city: job['city'] as String?,
      );

  factory OfferFormScreen.counter({
    required String offerId,
    required String durationType,
    required num amount,
    required int durationCount,
    required DateTime startDate,
    String? category,
    String? city,
  }) =>
      OfferFormScreen._(
        title: 'Counter-offer',
        offerId: offerId,
        durationType: durationType,
        initialAmount: amount,
        initialCount: durationCount,
        initialStart: startDate.toLocal(),
        category: category,
        city: city,
      );

  final String title;
  final Json? job;
  final String? offerId;
  final String durationType;
  final num initialAmount;
  final int initialCount;
  final DateTime initialStart;
  final String? category;
  final String? city;

  bool get isCounter => offerId != null;

  @override
  State<OfferFormScreen> createState() => _OfferFormScreenState();
}

class _OfferFormScreenState extends State<OfferFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _amount = TextEditingController(text: widget.initialAmount.round().toString());
  late final _count = TextEditingController(text: widget.initialCount.toString());
  final _note = TextEditingController();
  late DateTime _start = widget.initialStart;
  bool _busy = false;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _amount.dispose();
    _count.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _start.isBefore(today) ? today : _start,
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _start = picked);
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _fieldErrors = {};
    });
    final repo = context.read<Repository>();
    final note = _note.text.trim();
    final body = <String, dynamic>{
      'amount': int.parse(_amount.text.trim()),
      'durationCount': int.parse(_count.text.trim()),
      'startDate': _start.toUtc().toIso8601String(),
      if (note.isNotEmpty) (widget.isCounter ? 'message' : 'coverNote'): note,
    };
    if (!widget.isCounter) body['durationType'] = widget.durationType;
    try {
      final offer = widget.isCounter
          ? await repo.counter(widget.offerId!, body)
          : await repo.createOffer(widget.job!['_id'] as String, body);
      if (mounted) Navigator.of(context).pop(offer);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _fieldErrors = e.fieldErrors;
      });
      if (e.fieldErrors.isEmpty) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.title)),
        body: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              if (widget.job != null) ...[
                Card(
                  child: ListTile(
                    title: Text(widget.job!['title'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('Budget ${formatBudget(widget.job!['budget'] as Json?)} · ${widget.job!['city']}'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              FairPriceHint(
                category: widget.category,
                city: widget.city,
                durationType: widget.durationType,
                durationCount: int.tryParse(_count.text) ?? widget.initialCount,
                onApply: (_, __, median) => setState(() => _amount.text = median.round().toString()),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Total amount (PKR)',
                  prefixText: 'Rs ',
                  errorText: _fieldErrors['amount'],
                  helperText: 'For the whole ${durationTypes[widget.durationType]?.toLowerCase() ?? ''} engagement',
                ),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  return n == null || n < 100 ? 'Minimum offer is Rs 100' : null;
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _count,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Duration (${formatDuration(widget.durationType, 2).split(' ').last})',
                  errorText: _fieldErrors['durationCount'],
                ),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  return n == null || n < 1 || n > 365 ? 'Enter 1–365' : null;
                },
              ),
              const SizedBox(height: 14),
              InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(10),
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Start date',
                    suffixIcon: const Icon(Icons.calendar_today_outlined, size: 20),
                    errorText: _fieldErrors['startDate'],
                  ),
                  child: Text(formatDate(_start.toIso8601String())),
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _note,
                maxLines: 4,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: widget.isCounter ? 'Message (optional)' : 'Cover note (optional)',
                  alignLabelWithHint: true,
                  hintText: widget.isCounter ? 'Why this price?' : 'Tell the client why you are the right person',
                ),
              ),
              const SizedBox(height: 12),
              LoadingButton(
                label: widget.isCounter ? 'Send counter-offer' : 'Send offer',
                accent: true,
                loading: _busy,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      );
}
