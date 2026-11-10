import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worknest_flutter/core/constants.dart';
import 'package:worknest_flutter/widgets/common.dart';
import 'package:worknest_flutter/widgets/logo.dart';

void main() {
  testWidgets('the mark paints at every animation stage without throwing', (tester) async {
    for (final t in [0.0, 0.5, 1.0]) {
      await tester.pumpWidget(MaterialApp(home: WorkNestMark(tile: t, stroke: t)));
    }
    expect(find.byType(WorkNestMark), findsOneWidget);
  });

  testWidgets('status badge resolves booking labels', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: StatusBadge.booking('pending_payment'))));
    expect(find.text('Awaiting payment'), findsOneWidget);
  });

  testWidgets('empty state renders its message and action', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: EmptyState(icon: Icons.inbox, title: 'Nothing', message: 'Come back later', action: TextButton(onPressed: () {}, child: const Text('Go')))),
    ));
    expect(find.text('Nothing'), findsOneWidget);
    expect(find.text('Go'), findsOneWidget);
  });

  test('every category the app offers is one the backend knows', () {
    const backend = {
      'plumbing', 'electrical', 'carpentry', 'painting', 'masonry', 'cleaning', 'house_help', 'cooking',
      'babysitting', 'elderly_care', 'gardening', 'driving', 'ac_repair', 'appliance_repair', 'welding',
      'moving_labor', 'security_guard', 'other',
    };
    expect(categories.map((c) => c.value).toSet(), backend);
  });
}
