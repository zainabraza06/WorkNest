import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';
import '../../widgets/fair_price_hint.dart';

/// Post a public job, or — when [invitedWorkerId] is set — send a private direct-hire request
/// to one worker (the backend requires the worker and an opening amount together).
class PostJobScreen extends StatefulWidget {
  const PostJobScreen({super.key, this.invitedWorkerId, this.invitedWorkerName, this.presetCategory, this.presetCity});

  final String? invitedWorkerId;
  final String? invitedWorkerName;
  final String? presetCategory;
  final String? presetCity;

  bool get isDirect => invitedWorkerId != null;

  @override
  State<PostJobScreen> createState() => _PostJobScreenState();
}

class _PostJobScreenState extends State<PostJobScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _min = TextEditingController();
  final _max = TextEditingController();
  final _count = TextEditingController(text: '1');
  final _address = TextEditingController();
  final _offerAmount = TextEditingController();
  final _skills = TextEditingController();

  late String? _category = widget.presetCategory;
  late String _city = widget.presetCity ?? 'Karachi';
  String _durationType = 'one_day';
  String _urgency = 'normal';
  DateTime _start = DateTime.now().add(const Duration(days: 1));
  bool _busy = false;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    for (final c in [_title, _description, _min, _max, _count, _address, _offerAmount, _skills]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _start,
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _start = picked);
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_category == null) {
      showError(context, ApiException('Choose a category for the job.'));
      return;
    }
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _fieldErrors = {};
    });
    final (lat, lng) = cities[_city]!;
    final body = <String, dynamic>{
      'title': _title.text.trim(),
      'description': _description.text.trim(),
      'category': _category,
      'skills': _skills.text.split(',').map((s) => s.trim()).where((s) => s.length >= 2).toList(),
      'budget': {'min': int.parse(_min.text), 'max': int.parse(_max.text)},
      'durationType': _durationType,
      'durationCount': int.parse(_count.text),
      'startDate': DateTime(_start.year, _start.month, _start.day).toUtc().toIso8601String(),
      'urgency': _urgency,
      'location': {'lat': lat, 'lng': lng},
      'city': _city,
      if (_address.text.trim().isNotEmpty) 'address': _address.text.trim(),
      if (widget.isDirect) ...{
        'invitedWorker': widget.invitedWorkerId,
        'offerAmount': int.parse(_offerAmount.text),
      },
    };
    try {
      await context.read<Repository>().createJob(body);
      if (!mounted) return;
      showInfo(context, widget.isDirect ? 'Request sent to ${widget.invitedWorkerName}' : 'Job posted');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _fieldErrors = e.fieldErrors;
      });
      if (e.fieldErrors.isEmpty) showError(context, e);
    }
  }

  String? _requiredInt(String? v, {int min = 0, String? message}) {
    final n = int.tryParse(v ?? '');
    return n == null || n < min ? (message ?? 'Enter a number') : null;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.isDirect ? 'Hire ${widget.invitedWorkerName}' : 'Post a job')),
        body: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              TextFormField(
                controller: _title,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(labelText: 'Job title', hintText: 'e.g. Fix leaking kitchen tap', errorText: _fieldErrors['title']),
                validator: (v) => (v == null || v.trim().length < 5) ? 'At least 5 characters' : null,
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _category,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final c in categories)
                    DropdownMenuItem(value: c.value, child: Row(children: [Icon(c.icon, size: 18), const SizedBox(width: 10), Text(c.label)])),
                ],
                onChanged: (v) => setState(() => _category = v),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _description,
                minLines: 4,
                maxLines: 8,
                maxLength: 3000,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  labelText: 'Description',
                  alignLabelWithHint: true,
                  errorText: _fieldErrors['description'],
                  hintText: 'What needs doing, any materials, access notes…',
                ),
                validator: (v) => (v == null || v.trim().length < 20) ? 'Describe the job in at least 20 characters' : null,
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: _skills,
                decoration: const InputDecoration(labelText: 'Skills (comma separated, optional)'),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _durationType,
                decoration: const InputDecoration(labelText: 'Duration type'),
                items: [for (final e in durationTypes.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _durationType = v!),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _count,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: 'How many ${formatDuration(_durationType, 2).split(' ').last}?', errorText: _fieldErrors['durationCount']),
                validator: (v) => _requiredInt(v, min: 1, message: 'Enter 1–365'),
              ),
              const SizedBox(height: 14),
              FairPriceHint(
                category: _category,
                city: _city,
                durationType: _durationType,
                durationCount: int.tryParse(_count.text) ?? 1,
                urgency: _urgency,
                applyLabel: 'Use range',
                onApply: (min, max, median) => setState(() {
                  _min.text = min.round().toString();
                  _max.text = max.round().toString();
                  if (widget.isDirect) _offerAmount.text = median.round().toString();
                }),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _min,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: 'Budget min', prefixText: 'Rs ', errorText: _fieldErrors['budget.min']),
                      validator: (v) => _requiredInt(v, min: 100, message: 'Min Rs 100'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _max,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: 'Budget max', prefixText: 'Rs ', errorText: _fieldErrors['budget.max']),
                      validator: (v) {
                        final max = int.tryParse(v ?? ''), min = int.tryParse(_min.text);
                        if (max == null) return 'Enter a number';
                        return min != null && max < min ? 'Must be ≥ min' : null;
                      },
                    ),
                  ),
                ],
              ),
              if (widget.isDirect) ...[
                const SizedBox(height: 14),
                TextFormField(
                  controller: _offerAmount,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Your offer to ${widget.invitedWorkerName} (PKR)',
                    prefixText: 'Rs ',
                    errorText: _fieldErrors['offerAmount'],
                  ),
                  validator: (v) => _requiredInt(v, min: 100, message: 'Offer at least Rs 100'),
                ),
              ],
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
              DropdownButtonFormField<String>(
                initialValue: _urgency,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Urgency'),
                items: [for (final e in urgencies.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _urgency = v!),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _city,
                decoration: const InputDecoration(labelText: 'City'),
                items: [for (final c in cities.keys) DropdownMenuItem(value: c, child: Text(c))],
                onChanged: (v) => setState(() => _city = v!),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _address,
                decoration: const InputDecoration(
                  labelText: 'Address (optional)',
                  helperText: 'Only shared with the worker you hire',
                ),
              ),
              const SizedBox(height: 24),
              LoadingButton(
                label: widget.isDirect ? 'Send hire request' : 'Post job',
                accent: true,
                loading: _busy,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      );
}
