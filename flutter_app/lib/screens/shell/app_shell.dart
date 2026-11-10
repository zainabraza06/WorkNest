import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/auth_state.dart';
import '../bookings/bookings_screen.dart';
import '../home/home_screen.dart';
import '../jobs/browse_jobs_screen.dart';
import '../offers/offers_screen.dart';
import '../profile/profile_screen.dart';
import '../workers/discover_workers_screen.dart';

/// Role-aware bottom navigation. Clients hire (Find workers); workers browse jobs. Every tab
/// keeps its state when switched away from (IndexedStack).
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final isWorker = context.select<AuthState, bool>((a) => a.isWorker);

    final tabs = <_Tab>[
      _Tab('Home', Icons.home_outlined, Icons.home_rounded, HomeScreen(onNavigate: _go)),
      isWorker
          ? const _Tab('Jobs', Icons.work_outline, Icons.work_rounded, BrowseJobsScreen())
          : const _Tab('Workers', Icons.search, Icons.person_search_rounded, DiscoverWorkersScreen()),
      const _Tab('Offers', Icons.forum_outlined, Icons.forum_rounded, OffersScreen()),
      const _Tab('Bookings', Icons.event_available_outlined, Icons.event_available_rounded, BookingsScreen()),
      const _Tab('Account', Icons.person_outline, Icons.person_rounded, ProfileScreen()),
    ];

    return PopScope(
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _index = 0);
      },
      child: Scaffold(
        body: IndexedStack(index: _index, children: [for (final t in tabs) t.page]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: _go,
          destinations: [
            for (final t in tabs)
              NavigationDestination(icon: Icon(t.icon), selectedIcon: Icon(t.activeIcon), label: t.label),
          ],
        ),
      ),
    );
  }

  void _go(int i) => setState(() => _index = i);
}

class _Tab {
  const _Tab(this.label, this.icon, this.activeIcon, this.page);

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final Widget page;
}
