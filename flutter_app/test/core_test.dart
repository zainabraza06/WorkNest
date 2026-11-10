import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worknest_flutter/core/format.dart';
import 'package:worknest_flutter/services/api_client.dart';

void main() {
  group('format', () {
    test('formats PKR with grouping', () => expect(formatPKR(25000), 'Rs 25,000'));
    test('PKR handles null', () => expect(formatPKR(null), '—'));
    test('collapses an equal budget', () => expect(formatBudget({'min': 500, 'max': 500}), 'Rs 500'));
    test('shows a budget range', () => expect(formatBudget({'min': 500, 'max': 900}), 'Rs 500 – Rs 900'));
    test('pluralises durations', () {
      expect(formatDuration('one_day', 1), '1 day');
      expect(formatDuration('weekly', 3), '3 weeks');
    });
    test('initials', () => expect(initials('Ahmed Raza Khan'), 'AR'));
    test('titleCase', () => expect(titleCase('pending_payment'), 'Pending Payment'));
  });

  group('ApiClient', () {
    ApiClient clientFor(http.Client mock) => ApiClient(client: mock);

    test('unwraps the data envelope and sends the bearer token', () async {
      String? auth;
      final api = clientFor(MockClient((req) async {
        auth = req.headers['Authorization'];
        return http.Response(jsonEncode({'success': true, 'data': {'ok': 1}}), 200);
      }))
        ..token = 'abc';
      expect(await api.get('/auth/me'), {'ok': 1});
      expect(auth, 'Bearer abc');
    });

    test('maps validation details onto field errors', () async {
      final api = clientFor(MockClient((_) async => http.Response(
            jsonEncode({
              'success': false,
              'message': 'Validation failed',
              'details': [
                {'path': 'budget.max', 'message': 'Maximum must be at least the minimum'},
              ],
            }),
            400,
          )));
      try {
        await api.post('/jobs', {});
        fail('should throw');
      } on ApiException catch (e) {
        expect(e.status, 400);
        expect(e.fieldErrors['budget.max'], contains('Maximum'));
      }
    });

    test('a 401 on an authed session signs out, but not on a failed login', () async {
      var signedOut = 0;
      final api = clientFor(MockClient((_) async => http.Response(jsonEncode({'message': 'nope'}), 401)))
        ..token = 'abc'
        ..onUnauthorized = () => signedOut++;

      await expectLater(api.get('/jobs'), throwsA(isA<ApiException>()));
      expect(signedOut, 1);

      await expectLater(api.post('/auth/login', {}), throwsA(isA<ApiException>()));
      expect(signedOut, 1, reason: 'a rejected login is not an expired session');
    });

    test('retries an idempotent GET once on a 503, but never a POST', () async {
      var gets = 0, posts = 0;
      final api = clientFor(MockClient((req) async {
        if (req.method == 'GET') {
          gets++;
          return gets == 1 ? http.Response('', 503) : http.Response(jsonEncode({'data': 'fine'}), 200);
        }
        posts++;
        return http.Response('', 503);
      }));
      expect(await api.get('/jobs'), 'fine');
      expect(gets, 2);
      await expectLater(api.post('/jobs', {}), throwsA(isA<ApiException>()));
      expect(posts, 1);
    });

    test('drops empty query params', () async {
      Uri? seen;
      final api = clientFor(MockClient((req) async {
        seen = req.url;
        return http.Response(jsonEncode({'data': {}}), 200);
      }));
      await api.get('/jobs', query: {'q': '', 'category': null, 'page': 2});
      expect(seen!.queryParameters, {'page': '2'});
    });
  });
}
