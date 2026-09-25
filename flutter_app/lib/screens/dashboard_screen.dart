import 'package:flutter/material.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Welcome to WorkNest!', style: TextStyle(fontSize: 24)),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                // Navigate to Jobs
              },
              child: const Text('View Jobs'),
            ),
            ElevatedButton(
              onPressed: () {
                // Navigate to Bookings
              },
              child: const Text('View Bookings'),
            ),
          ],
        ),
      ),
    );
  }
}
