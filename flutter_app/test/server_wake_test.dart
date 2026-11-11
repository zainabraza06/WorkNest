import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:worknest_flutter/state/server_wake_state.dart';
import 'package:worknest_flutter/widgets/server_wake_overlay.dart';

http.Response ready() => http.Response('{"success":true,"status":"ready","db":"connected"}', 200);

/// Short real durations so the whole poll loop runs in milliseconds.
ServerWakeState fast(http.Client client, {Duration giveUp = const Duration(seconds: 2)}) => ServerWakeState(
      client: client,
      url: Uri.parse('http://test/api/health/ready'),
      grace: const Duration(milliseconds: 40),
      retryEvery: const Duration(milliseconds: 20),
      giveUpAfter: giveUp,
      checkTimeout: const Duration(milliseconds: 500),
    );

Future<void> settle([int ms = 150]) => Future<void>.delayed(Duration(milliseconds: ms));

void main() {
  setUp(ServerWakeState.forgetAwake);

  group('ServerWakeState', () {
    test('stays silent when the server answers straight away', () async {
      final seen = <WakeStatus>[];
      final s = fast(MockClient((_) async => ready()));
      s.addListener(() => seen.add(s.status));
      s.start();
      await settle(200);
      expect(s.status, WakeStatus.awake);
      expect(seen, isNot(contains(WakeStatus.waking))); // never flashed the card
      s.dispose();
    });

    test('announces the wake-up while there is no answer, then says ready', () async {
      var up = false;
      final seen = <WakeStatus>[];
      final s = fast(MockClient((_) async {
        if (!up) throw const SocketException('connection refused');
        return ready();
      }));
      s.addListener(() => seen.add(s.status));
      s.start();
      await settle(150);
      expect(s.status, WakeStatus.waking);
      expect(s.visible, isTrue);

      up = true;
      await settle(150);
      expect(s.status, WakeStatus.ready);
      expect(seen, containsAllInOrder([WakeStatus.checking, WakeStatus.waking, WakeStatus.ready]));
      s.dispose();
    });

    test("treats the platform's wake page (200 but not our JSON) as not up yet", () async {
      var up = false;
      final s = fast(MockClient((_) async => up ? ready() : http.Response('<html>Service waking up</html>', 200)));
      s.start();
      await settle(150);
      expect(s.status, WakeStatus.waking);
      up = true;
      await settle(150);
      expect(s.status, WakeStatus.ready);
      s.dispose();
    });

    test('a non-200 or a draining status is not ready', () async {
      final s = fast(MockClient((_) async => http.Response('{"status":"draining"}', 503)));
      s.start();
      await settle(150);
      expect(s.status, WakeStatus.waking);
      s.dispose();
    });

    test('does not interrupt a user who dismissed the card', () async {
      var up = false;
      final s = fast(MockClient((_) async => up ? ready() : throw const SocketException('down')));
      s.start();
      await settle(150);
      expect(s.status, WakeStatus.waking);
      s.dismiss();
      expect(s.status, WakeStatus.awake);
      up = true;
      await settle(150);
      expect(s.status, WakeStatus.awake); // no "ready" card after they carried on
      s.dispose();
    });

    test('gives up after a long silence, and Try again returns to waiting then confirms', () async {
      var up = false;
      final s = fast(MockClient((_) async => up ? ready() : throw const SocketException('down')),
          giveUp: const Duration(milliseconds: 200));
      s.start();
      await settle(500);
      expect(s.status, WakeStatus.failed);

      up = true;
      s.retry();
      expect(s.status, WakeStatus.waking); // straight back to the waiting card
      await settle(150);
      expect(s.status, WakeStatus.ready);
      s.dispose();
    });

    test('trusts a recent answer instead of asking again', () async {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return ready();
      });
      final first = fast(client)..start();
      await settle(150);
      first.dispose();
      expect(calls, 1);

      final second = fast(client)..start();
      await settle(150);
      expect(second.status, WakeStatus.awake);
      expect(calls, 1); // no second request
      second.dispose();
    });

    test('asks again once the remembered answer is older than the idle window', () async {
      var calls = 0;
      var clock = DateTime(2026, 1, 1, 12);
      final client = MockClient((_) async {
        calls++;
        return ready();
      });
      ServerWakeState withClock() => ServerWakeState(
            client: client,
            url: Uri.parse('http://test/api/health/ready'),
            grace: const Duration(milliseconds: 40),
            now: () => clock,
          );
      final a = withClock()..start();
      await settle(100);
      a.dispose();
      clock = clock.add(const Duration(minutes: 20));
      final b = withClock()..start();
      await settle(100);
      b.dispose();
      expect(calls, 2);
    });
  });

  group('WakeCard', () {
    Widget host(WakeStatus status, {int elapsed = 0, VoidCallback? onDismiss, VoidCallback? onRetry}) => MaterialApp(
          home: Scaffold(
            body: WakeCard(status: status, elapsed: elapsed, onDismiss: onDismiss ?? () {}, onRetry: onRetry ?? () {}),
          ),
        );

    testWidgets('renders nothing while checking or awake', (tester) async {
      await tester.pumpWidget(host(WakeStatus.checking));
      expect(find.byType(Card), findsNothing);
      expect(find.textContaining('Server'), findsNothing);
      await tester.pumpWidget(host(WakeStatus.awake));
      expect(find.textContaining('Server'), findsNothing);
    });

    testWidgets('explains the wait and shows the running timer', (tester) async {
      await tester.pumpWidget(host(WakeStatus.waking, elapsed: 12));
      expect(find.text('Server is waking up'), findsOneWidget);
      expect(find.text('Free tier on Render · 12s'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(find.text('Dismiss'), findsOneWidget);
    });

    testWidgets('says to continue working once the server is up; Continue dismisses', (tester) async {
      var dismissed = 0;
      await tester.pumpWidget(host(WakeStatus.ready, elapsed: 34, onDismiss: () => dismissed++));
      expect(find.text('Server is up'), findsOneWidget);
      expect(find.text('Woke up in 34s. You can continue working.'), findsOneWidget);
      await tester.tap(find.text('Continue'));
      expect(dismissed, 1);
    });

    testWidgets('offers a retry when the server never answered', (tester) async {
      var retried = 0;
      await tester.pumpWidget(host(WakeStatus.failed, onRetry: () => retried++));
      expect(find.text("Still can't reach the server"), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retried, 1);
    });
  });

  group('ServerWakeOverlay', () {
    testWidgets('shows nothing when the server is awake, and the card when it is waking', (tester) async {
      var up = false;
      final state = fast(MockClient((_) async => up ? ready() : throw const SocketException('down')));
      addTearDown(state.dispose);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: const MaterialApp(
            home: Stack(children: [Scaffold(body: Text('app')), ServerWakeOverlay()]),
          ),
        ),
      );
      expect(find.text('Server is waking up'), findsNothing);

      await tester.runAsync(() async {
        state.start();
        await settle(150);
      });
      await tester.pump();
      expect(find.text('Server is waking up'), findsOneWidget);

      up = true;
      await tester.runAsync(() => settle(150));
      await tester.pump();
      expect(find.text('Server is up'), findsOneWidget);

      await tester.tap(find.text('Continue'));
      await tester.pump();
      expect(find.text('Server is up'), findsNothing);
      expect(find.text('app'), findsOneWidget);
    });
  });
}
