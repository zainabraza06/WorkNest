import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../widgets/common.dart';

/// Create or edit the worker's public profile. Loads the existing one (if any) so the same
/// screen serves onboarding and later edits.
class WorkerProfileFormScreen extends StatefulWidget {
  const WorkerProfileFormScreen({super.key});

  @override
  State<WorkerProfileFormScreen> createState() => _WorkerProfileFormScreenState();
}

class _WorkerProfileFormScreenState extends State<WorkerProfileFormScreen> {
  final _form = GlobalKey<FormState>();
  final _headline = TextEditingController();
  final _bio = TextEditingController();
  final _skills = TextEditingController();
  final _years = TextEditingController(text: '0');
  final _daily = TextEditingController();
  final _hourly = TextEditingController();
  final _monthly = TextEditingController();
  final _address = TextEditingController();
  final _selected = <String>{};
  String _city = 'Karachi';
  bool _available = true;

  bool _loading = true;
  bool _exists = false;
  bool _busy = false;
  Object? _loadError;
  Map<String, String> _fieldErrors = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_headline, _bio, _skills, _years, _daily, _hourly, _monthly, _address]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final p = await context.read<Repository>().myWorkerProfile();
      if (!mounted) return;
      if (p != null) {
        _exists = true;
        _headline.text = (p['headline'] as String?) ?? '';
        _bio.text = (p['bio'] as String?) ?? '';
        _skills.text = ((p['skills'] as List?) ?? const []).join(', ');
        _years.text = '${p['experienceYears'] ?? 0}';
        final rates = p['rates'] as Json?;
        _daily.text = '${rates?['daily'] ?? ''}';
        _hourly.text = rates?['hourly'] == null ? '' : '${rates!['hourly']}';
        _monthly.text = rates?['monthly'] == null ? '' : '${rates!['monthly']}';
        _address.text = (p['address'] as String?) ?? '';
        _selected.addAll(((p['categories'] as List?) ?? const []).cast<String>());
        _city = (p['city'] as String?) ?? _city;
        _available = p['isAvailable'] != false;
      }
      setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = e;
        });
      }
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_selected.isEmpty) {
      showError(context, ApiException('Select at least one category.'));
      return;
    }
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _fieldErrors = {};
    });
    int? opt(TextEditingController c) => int.tryParse(c.text.trim());
    final (lat, lng) = cities[_city]!;
    final body = <String, dynamic>{
      'headline': _headline.text.trim(),
      'bio': _bio.text.trim(),
      'categories': _selected.toList(),
      'skills': _skills.text.split(',').map((s) => s.trim()).where((s) => s.length >= 2).toList(),
      'experienceYears': opt(_years) ?? 0,
      'rates': {
        'daily': opt(_daily),
        if (opt(_hourly) != null) 'hourly': opt(_hourly),
        if (opt(_monthly) != null) 'monthly': opt(_monthly),
      },
      'location': {'lat': lat, 'lng': lng},
      'city': _city,
      if (_address.text.trim().isNotEmpty) 'address': _address.text.trim(),
      'isAvailable': _available,
    };
    try {
      final repo = context.read<Repository>();
      if (_exists) {
        await repo.updateWorkerProfile(body);
      } else {
        await repo.createWorkerProfile(body);
      }
      if (mounted) Navigator.of(context).pop(true);
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
  Widget build(BuildContext context) {
    if (_loading) return Scaffold(appBar: AppBar(title: const Text('Worker profile')), body: const ListSkeleton(count: 3));
    if (_loadError != null) {
      return Scaffold(appBar: AppBar(title: const Text('Worker profile')), body: ErrorState(error: _loadError!, onRetry: _load));
    }
    return Scaffold(
      appBar: AppBar(title: Text(_exists ? 'Edit profile' : 'Set up your profile')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          children: [
            TextFormField(
              controller: _headline,
              maxLength: 100,
              decoration: InputDecoration(labelText: 'Headline', hintText: 'e.g. Licensed electrician, 8 years', errorText: _fieldErrors['headline']),
            ),
            TextFormField(
              controller: _bio,
              maxLines: 4,
              maxLength: 2000,
              decoration: InputDecoration(labelText: 'About you', alignLabelWithHint: true, errorText: _fieldErrors['bio']),
            ),
            const SizedBox(height: 8),
            Text('What do you do? (up to 5)', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final c in categories)
                FilterChip(
                  label: Text(c.label),
                  selected: _selected.contains(c.value),
                  showCheckmark: false,
                  labelStyle: TextStyle(color: _selected.contains(c.value) ? Colors.white : Palette.ink700, fontWeight: FontWeight.w600),
                  onSelected: (on) => setState(() {
                    if (on && _selected.length < 5) _selected.add(c.value);
                    if (!on) _selected.remove(c.value);
                  }),
                ),
            ]),
            const SizedBox(height: 16),
            TextFormField(controller: _skills, decoration: const InputDecoration(labelText: 'Skills (comma separated)')),
            const SizedBox(height: 14),
            TextFormField(
              controller: _years,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Years of experience'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _daily,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'Daily rate (PKR)', prefixText: 'Rs ', errorText: _fieldErrors['rates.daily']),
              validator: (v) => (int.tryParse(v ?? '') ?? 0) <= 0 ? 'Daily rate is required' : null,
            ),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(
                child: TextFormField(controller: _hourly, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Hourly (optional)', prefixText: 'Rs ')),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _monthly,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'Monthly (optional)', prefixText: 'Rs ', errorText: _fieldErrors['rates.monthly']),
                ),
              ),
            ]),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _city,
              decoration: const InputDecoration(labelText: 'City'),
              items: [for (final c in cities.keys) DropdownMenuItem(value: c, child: Text(c))],
              onChanged: (v) => setState(() => _city = v!),
            ),
            const SizedBox(height: 14),
            TextFormField(controller: _address, decoration: const InputDecoration(labelText: 'Area / address (optional)')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Available for work'),
              value: _available,
              activeThumbColor: Palette.primary500,
              onChanged: (v) => setState(() => _available = v),
            ),
            const SizedBox(height: 12),
            LoadingButton(label: _exists ? 'Save changes' : 'Create profile', accent: true, loading: _busy, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
