import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../state/auth_state.dart';
import '../widgets/logo.dart';
import '../widgets/transitions.dart';
import 'auth/login_screen.dart';
import 'shell/app_shell.dart';

/// Branded launch sequence: the tile pops in, the "W" draws itself, the wordmark rises.
/// Meanwhile the saved session is validated, and the screen hands off only when both the
/// animation and the check are done — so a returning user lands straight in the app and a new
/// one gets a smooth morph into the login screen via the shared `wn-mark` Hero.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1700));

  late final Animation<double> _tile = CurvedAnimation(parent: _c, curve: const Interval(0, 0.35));
  late final Animation<double> _stroke =
      CurvedAnimation(parent: _c, curve: const Interval(0.3, 0.75, curve: Curves.easeInOutCubic));
  late final Animation<double> _word = CurvedAnimation(parent: _c, curve: const Interval(0.7, 1, curve: Curves.easeOut));

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    final auth = context.read<AuthState>();
    await Future.wait([_c.forward(), auth.bootstrap()]);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    final next = auth.status == AuthStatus.signedIn ? const AppShell() : const LoginScreen();
    Navigator.of(context).pushReplacement(
      auth.status == AuthStatus.signedIn ? revealRoute(next) : fadeScaleRoute(next),
    );
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Palette.ink950,
        body: Center(
          child: AnimatedBuilder(
            animation: _c,
            builder: (_, __) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Hero(
                  tag: 'wn-mark',
                  child: WorkNestMark(size: 96, tile: _tile.value, stroke: _stroke.value, invert: true),
                ),
                const SizedBox(height: 24),
                Opacity(
                  opacity: _word.value,
                  child: Transform.translate(
                    offset: Offset(0, 12 * (1 - _word.value)),
                    child: const Text(
                      'WorkNest',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 32,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Opacity(
                  opacity: _word.value * 0.7,
                  child: const Text(
                    'Skilled work, done right.',
                    style: TextStyle(color: Palette.ink400, fontSize: 14),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
