import 'package:flutter/material.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const WorkNestApp());
}

class WorkNestApp extends StatelessWidget {
  const WorkNestApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WorkNest',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const LoginScreen(),
    );
  }
}
