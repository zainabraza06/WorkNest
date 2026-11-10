import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../widgets/logo.dart';

/// Dark brand header + white sheet, shared by login and register. The header mark carries the
/// `wn-mark` Hero so the splash logo morphs into it.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, required this.subtitle, required this.child});

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Palette.ink950,
        resizeToAvoidBottomInset: true,
        body: SafeArea(
          bottom: false,
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(24, 28, 24, 28),
                      child: Row(
                        children: [
                          Hero(tag: 'wn-mark', child: WorkNestMark(size: 44, invert: true)),
                          SizedBox(width: 12),
                          Text(
                            'WorkNest',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title, style: Theme.of(context).textTheme.headlineMedium),
                          const SizedBox(height: 6),
                          Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 24),
                          child,
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
