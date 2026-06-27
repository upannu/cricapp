import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/players_screen.dart';
import 'screens/player_profile_screen.dart';

void main() {
  runApp(const PaceHQApp());
}

final _router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      builder: (_, __) => const LoginScreen(),
    ),
    GoRoute(
      path: '/players',
      builder: (_, __) => const PlayersScreen(),
    ),
    GoRoute(
      path: '/players/:id',
      builder: (_, state) =>
          PlayerProfileScreen(playerId: state.pathParameters['id']!),
    ),
  ],
);

class PaceHQApp extends StatelessWidget {
  const PaceHQApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'PACE HQ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      routerConfig: _router,
    );
  }
}
