import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../services/repository.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';
import '../../widgets/transitions.dart';
import '../auth/login_screen.dart';
import '../earnings/earnings_screen.dart';
import 'worker_profile_form_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _signOut(BuildContext context, {bool everywhere = false}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(everywhere ? 'Sign out everywhere?' : 'Sign out?'),
        content: Text(everywhere
            ? 'This ends your session on every phone and browser where you are signed in.'
            : 'You will need to sign in again to see your jobs and offers.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Stay')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Palette.danger),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final navigator = Navigator.of(context);
    final auth = context.read<AuthState>();
    if (everywhere) {
      try {
        await auth.signOutEverywhere();
      } catch (_) {
        await auth.signOut(); // offline: still end this device's session
      }
    } else {
      await auth.signOut();
    }
    navigator.pushAndRemoveUntil(fadeScaleRoute(const LoginScreen()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final user = auth.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                Avatar(name: auth.name, url: (user?['avatar'] as Json?)?['url'] as String?, size: 60),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(auth.name, style: Theme.of(context).textTheme.titleLarge),
                    Text((user?['email'] as String?) ?? '', style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 6),
                    StatusBadge(auth.isWorker ? 'Worker' : 'Client', Tone.solid),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          if (auth.isWorker) ...[
            _Tile(Icons.badge_outlined, 'Worker profile', 'Headline, rates, categories, city', () async {
              final done = await Navigator.of(context).push<bool>(pushRoute(const WorkerProfileFormScreen()));
              if (done == true && context.mounted) showInfo(context, 'Profile saved');
            }),
            _Tile(Icons.account_balance_wallet_outlined, 'Earnings & payouts', 'Balance, withdrawals, payout method',
                () => Navigator.of(context).push(pushRoute(const EarningsScreen()))),
          ],
          _Tile(Icons.person_outline, 'Edit details', 'Name and phone', () => _editDetails(context)),
          _Tile(Icons.lock_outline, 'Change password', 'Keep your account secure', () => _changePassword(context)),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Palette.danger),
            onPressed: () => _signOut(context),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
          ),
          TextButton(
            onPressed: () => _signOut(context, everywhere: true),
            child: const Text('Sign out of all devices', style: TextStyle(color: Palette.ink500)),
          ),
          const SizedBox(height: 24),
          Center(child: Text('WorkNest 1.0.0', style: Theme.of(context).textTheme.bodySmall)),
        ],
      ),
    );
  }

  Future<void> _editDetails(BuildContext context) async {
    final auth = context.read<AuthState>();
    final repo = context.read<Repository>();
    final name = TextEditingController(text: auth.name);
    final phone = TextEditingController(text: (auth.user?['phone'] as String?) ?? '');
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(ctx).bottom + 20),
        child: _SheetForm(
          title: 'Edit details',
          fields: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Full name')),
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
          ],
          onSubmit: () async {
            await repo.updateMe({
              'name': name.text.trim(),
              if (phone.text.trim().isNotEmpty) 'phone': phone.text.trim(),
            });
            await auth.refreshMe();
          },
        ),
      ),
    );
    if (saved == true && context.mounted) showInfo(context, 'Details updated');
  }

  Future<void> _changePassword(BuildContext context) async {
    final auth = context.read<AuthState>();
    final current = TextEditingController();
    final next = TextEditingController();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(ctx).bottom + 20),
        child: _SheetForm(
          title: 'Change password',
          fields: [
            TextField(controller: current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
            TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: '8+ characters with a letter and a number')),
          ],
          onSubmit: () => auth.changePassword(current.text, next.text),
        ),
      ),
    );
    if (saved == true && context.mounted) showInfo(context, 'Password changed');
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.icon, this.title, this.subtitle, this.onTap);

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Card(
          child: ListTile(
            onTap: onTap,
            leading: Icon(icon, color: Palette.ink800),
            title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(subtitle),
            trailing: const Icon(Icons.chevron_right, color: Palette.ink400),
          ),
        ),
      );
}

class _SheetForm extends StatefulWidget {
  const _SheetForm({required this.title, required this.fields, required this.onSubmit});

  final String title;
  final List<Widget> fields;
  final Future<void> Function() onSubmit;

  @override
  State<_SheetForm> createState() => _SheetFormState();
}

class _SheetFormState extends State<_SheetForm> {
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await widget.onSubmit();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          for (final f in widget.fields) ...[f, const SizedBox(height: 12)],
          const SizedBox(height: 6),
          LoadingButton(label: 'Save', loading: _busy, onPressed: _submit),
        ],
      );
}
