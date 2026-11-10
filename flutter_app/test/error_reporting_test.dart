import 'package:flutter_test/flutter_test.dart';
import 'package:worknest_flutter/core/error_reporting.dart';

void main() {
  tearDown(() => ErrorReporting.onReport = null);

  test('forwards errors to the installed reporter', () {
    Object? seen;
    ErrorReporting.onReport = (e, _) => seen = e;
    ErrorReporting.report(StateError('boom'), null);
    expect(seen, isA<StateError>());
  });

  test('a throwing reporter cannot cause a second crash', () {
    ErrorReporting.onReport = (_, __) => throw StateError('reporter down');
    expect(() => ErrorReporting.report(Exception('x'), null), returnsNormally);
  });
}
