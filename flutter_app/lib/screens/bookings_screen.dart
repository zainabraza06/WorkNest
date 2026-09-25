import 'package:flutter/material.dart';

class BookingsScreen extends StatelessWidget {
  const BookingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Bookings')),
      body: ListView.builder(
        itemCount: 5,
        itemBuilder: (context, index) {
          return Card(
            margin: const EdgeInsets.all(8.0),
            child: ListTile(
              leading: const Icon(Icons.event_available, color: Colors.green),
              title: Text('Booking #${index + 1}'),
              subtitle: Text('Status: Confirmed\nDate: Oct ${10 + index}, 2026'),
              isThreeLine: true,
              trailing: ElevatedButton(
                onPressed: () {
                  // View details
                },
                child: const Text('Details'),
              ),
            ),
          );
        },
      ),
    );
  }
}
