import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../services/api_client.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../shell/app_shell.dart';
import 'auth_scaffold.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  String _role = 'client';
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _fieldErrors = {};
    });
    final auth = context.read<AuthState>();
    final navigator = Navigator.of(context);
    try {
      await auth.register(
        name: _name.text,
        email: _email.text,
        password: _password.text,
        role: _role,
        phone: _phone.text,
      );
      if (!mounted) return;
      navigator.pushAndRemoveUntil(revealRoute(const AppShell()), (_) => false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _fieldErrors = e.fieldErrors;
        _error = e.fieldErrors.isEmpty ? e.message : null;
      });
    }
  }

  String? _passwordRule(String? v) {
    if (v == null || v.length < 8) return 'At least 8 characters';
    if (!RegExp(r'[A-Za-z]').hasMatch(v)) return 'Include a letter';
    if (!RegExp(r'\d').hasMatch(v)) return 'Include a number';
    return null;
  }

  @override
  Widget build(BuildContext context) => AuthScaffold(
        title: 'Create your account',
        subtitle: 'Hire skilled workers, or find your next job.',
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: _RoleCard('client', 'I want to hire', Icons.person_search_outlined, _role, _pick)),
                  const SizedBox(width: 12),
                  Expanded(child: _RoleCard('worker', 'I want to work', Icons.construction_outlined, _role, _pick)),
                ],
              ),
              const SizedBox(height: 18),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Text(_error!, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w600)),
                ),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                decoration: InputDecoration(
                  labelText: 'Full name',
                  prefixIcon: const Icon(Icons.badge_outlined),
                  errorText: _fieldErrors['name'],
                ),
                validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your name' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                decoration: InputDecoration(
                  labelText: 'Email',
                  prefixIcon: const Icon(Icons.mail_outline),
                  errorText: _fieldErrors['email'],
                ),
                validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email address' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                decoration: InputDecoration(
                  labelText: 'Phone (optional)',
                  prefixIcon: const Icon(Icons.phone_outlined),
                  errorText: _fieldErrors['phone'],
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _password,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onFieldSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  labelText: 'Password',
                  helperText: '8+ characters with a letter and a number',
                  prefixIcon: const Icon(Icons.lock_outline),
                  errorText: _fieldErrors['password'],
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: _passwordRule,
              ),
              const SizedBox(height: 22),
              LoadingButton(label: 'Create account', loading: _busy, onPressed: _submit),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                  child: const Text('I already have an account'),
                ),
              ),
            ],
          ),
        ),
      );

  void _pick(String role) => setState(() => _role = role);
}

class _RoleCard extends StatelessWidget {
  const _RoleCard(this.value, this.label, this.icon, this.selected, this.onTap);

  final String value;
  final String label;
  final IconData icon;
  final String selected;
  final void Function(String) onTap;

  @override
  Widget build(BuildContext context) {
    final on = selected == value;
    return Semantics(
      selected: on,
      button: true,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => onTap(value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          decoration: BoxDecoration(
            color: on ? Palette.ink950 : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: on ? Palette.ink950 : Palette.ink300),
          ),
          child: Column(
            children: [
              Icon(icon, color: on ? Palette.primary500 : Palette.ink500),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w700, color: on ? Colors.white : Palette.ink800),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
