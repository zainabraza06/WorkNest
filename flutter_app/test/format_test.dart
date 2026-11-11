import 'package:flutter_test/flutter_test.dart';
import 'package:worknest_flutter/core/format.dart';

void main() {
  group('countOf', () {
    test('uses the singular for exactly one', () {
      expect(countOf(1, 'offer'), '1 offer');
    });

    test('uses the plural for zero and for many', () {
      expect(countOf(0, 'offer'), '0 offers');
      expect(countOf(2, 'offer'), '2 offers');
      expect(countOf(12, 'offer'), '12 offers');
    });

    test('accepts an irregular plural', () {
      expect(countOf(1, 'person', 'people'), '1 person');
      expect(countOf(3, 'person', 'people'), '3 people');
    });

    test('tolerates a numeric value that arrived as a double from JSON', () {
      expect(countOf(1.0, 'offer'), '1 offer');
    });
  });
}
