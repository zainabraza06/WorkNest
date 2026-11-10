import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../services/api_client.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../shell/app_shell.dart';
import 'auth_scaffold.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
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
      await auth.login(_email.text, _password.text);
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

  @override
  Widget build(BuildContext context) {
    final notice = context.select<AuthState, String?>((a) => a.notice);
    return AuthScaffold(
      title: 'Welcome back',
      subtitle: 'Sign in to manage your jobs and offers.',
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (notice != null && _error == null) _Banner(notice, tone: Tone.warning),
            if (_error != null) _Banner(_error!, tone: Tone.danger),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.username, AutofillHints.email],
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(
                labelText: 'Email',
                prefixIcon: const Icon(Icons.mail_outline),
                errorText: _fieldErrors['email'],
              ),
              validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email address' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _password,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock_outline),
                errorText: _fieldErrors['password'],
                suffixIcon: IconButton(
                  tooltip: _obscure ? 'Show password' : 'Hide password',
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
            ),
            const SizedBox(height: 22),
            LoadingButton(label: 'Sign in', loading: _busy, onPressed: _submit),
            const SizedBox(height: 18),
            Center(
              child: TextButton(
                onPressed: _busy
                    ? null
                    : () => Navigator.of(context).push(pushRoute(const RegisterScreen())),
                child: const Text.rich(
                  TextSpan(
                    text: 'New to WorkNest? ',
                    style: TextStyle(color: Palette.ink600),
                    children: [
                      TextSpan(
                        text: 'Create an account',
                        style: TextStyle(color: Palette.ink950, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner(this.message, {required this.tone});

  final String message;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final danger = tone == Tone.danger;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: danger ? const Color(0xFFFEF2F2) : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: danger ? const Color(0xFFFECACA) : const Color(0xFFFDE68A)),
      ),
      child: Row(
        children: [
          Icon(danger ? Icons.error_outline : Icons.info_outline,
              size: 18, color: danger ? Palette.danger : Palette.warning),
          const SizedBox(width: 8),
          Expanded(child: Text(message, style: TextStyle(color: danger ? const Color(0xFF991B1B) : const Color(0xFF92400E)))),
        ],
      ),
    );
  }
}
