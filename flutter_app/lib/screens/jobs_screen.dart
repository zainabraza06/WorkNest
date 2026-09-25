import 'package:flutter/material.dart';

class JobsScreen extends StatelessWidget {
  const JobsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Available Jobs')),
      body: ListView.builder(
        itemCount: 10,
        itemBuilder: (context, index) {
          return ListTile(
            title: Text('Job #${index + 1}'),
            subtitle: Text('Description for job #${index + 1}'),
            trailing: const Icon(Icons.arrow_forward_ios),
            onTap: () {
              // View job details
            },
          );
        },
      ),
    );
  }
}
