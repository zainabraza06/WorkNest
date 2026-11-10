import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'core/theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/repository.dart';
import 'state/auth_state.dart';
import 'widgets/transitions.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  final api = ApiClient();
  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        Provider<Repository>(create: (_) => Repository(api)),
        ChangeNotifierProvider<AuthState>(create: (_) => AuthState(api)),
      ],
      child: const WorkNestApp(),
    ),
  );
}

final navigatorKey = GlobalKey<NavigatorState>();

class WorkNestApp extends StatefulWidget {
  const WorkNestApp({super.key});

  @override
  State<WorkNestApp> createState() => _WorkNestAppState();
}

class _WorkNestAppState extends State<WorkNestApp> {
  AuthStatus? _last;
  late final AuthState _auth = context.read<AuthState>();

  @override
  void initState() {
    super.initState();
    _auth.addListener(_onAuthChanged);
  }

  /// A 401 anywhere in the app signs the user out; send them to login from wherever they are.
  void _onAuthChanged() {
    final was = _last;
    _last = _auth.status;
    if (was == AuthStatus.signedIn && _auth.status == AuthStatus.signedOut) {
      navigatorKey.currentState?.pushAndRemoveUntil(fadeScaleRoute(const LoginScreen()), (_) => false);
    }
  }

  @override
  void dispose() {
    _auth.removeListener(_onAuthChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'WorkNest',
        debugShowCheckedModeBanner: false,
        navigatorKey: navigatorKey,
        theme: buildTheme(),
        builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
          child: child!,
        ),
        home: const SplashScreen(),
      );
}
