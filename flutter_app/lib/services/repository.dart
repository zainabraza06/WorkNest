import 'api_client.dart';

export 'api_client.dart';

/// One place that knows the API's endpoints, so screens never build URLs. Mirrors
/// frontend/src/api/index.js and negotiation.js — adding an endpoint on both clients should be
/// a one-line change in each.
class Repository {
  Repository(this.api);

  final ApiClient api;

  Future<Json> _obj(Future<dynamic> f) async => (await f) as Json;

  // Jobs
  Future<Json> jobs(Map<String, dynamic> q) => _obj(api.get('/jobs', query: q));
  Future<Json> myJobs(Map<String, dynamic> q) => _obj(api.get('/jobs/mine', query: q));
  Future<Json> job(String id) => _obj(api.get('/jobs/$id'));
  Future<Json> createJob(Json body) => _obj(api.post('/jobs', body));
  Future<Json> cancelJob(String id, [String? reason]) =>
      _obj(api.post('/jobs/$id/cancel', {if (reason != null && reason.isNotEmpty) 'reason': reason}));

  // Workers
  Future<Json> searchWorkers(Map<String, dynamic> q) => _obj(api.get('/workers', query: q));
  Future<Json> worker(String userId) => _obj(api.get('/workers/$userId'));
  Future<Json?> myWorkerProfile() async {
    try {
      return await _obj(api.get('/workers/me'));
    } on ApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  Future<Json> createWorkerProfile(Json body) => _obj(api.post('/workers/me', body));
  Future<Json> updateWorkerProfile(Json body) => _obj(api.patch('/workers/me', body));
  Future<Json> createClientProfile(Json body) => _obj(api.post('/clients/me', body));
  Future<Json> priceSuggestion(Map<String, dynamic> q) => _obj(api.get('/price/suggest', query: q));

  // Offers / negotiation
  Future<Json> offers(Map<String, dynamic> q) => _obj(api.get('/offers', query: q));
  Future<Json> offer(String id) => _obj(api.get('/offers/$id'));
  Future<Json> createOffer(String jobId, Json body) => _obj(api.post('/jobs/$jobId/offers', body));
  Future<Json> counter(String id, Json body) => _obj(api.post('/offers/$id/counter', body));
  Future<Json> acceptOffer(String id) => _obj(api.post('/offers/$id/accept'));
  Future<Json> rejectOffer(String id, [String? reason]) =>
      _obj(api.post('/offers/$id/reject', {if (reason != null && reason.isNotEmpty) 'reason': reason}));
  Future<Json> withdrawOffer(String id, [String? reason]) =>
      _obj(api.post('/offers/$id/withdraw', {if (reason != null && reason.isNotEmpty) 'reason': reason}));
  Future<Json> messages(String id, {String? before}) =>
      _obj(api.get('/offers/$id/messages', query: {'before': before}));
  Future<Json> sendMessage(String id, String text) => _obj(api.post('/offers/$id/messages', {'text': text}));
  Future<void> markOfferRead(String id) async => api.post('/offers/$id/read');

  // Bookings
  Future<Json> bookings(Map<String, dynamic> q) => _obj(api.get('/bookings', query: q));
  Future<Json> booking(String id) => _obj(api.get('/bookings/$id'));
  Future<Json> syncPayment(String id) => _obj(api.post('/bookings/$id/payment/sync'));
  Future<Json> startBooking(String id) => _obj(api.post('/bookings/$id/start'));
  Future<Json> completeBooking(String id) => _obj(api.post('/bookings/$id/complete'));
  Future<Json> cancelBooking(String id, [String? reason]) =>
      _obj(api.post('/bookings/$id/cancel', {if (reason != null && reason.isNotEmpty) 'reason': reason}));
  Future<Json> review(String bookingId, Json body) => _obj(api.post('/bookings/$bookingId/reviews', body));
  Future<Json> userReviews(String userId, {int page = 1}) =>
      _obj(api.get('/users/$userId/reviews', query: {'page': page}));

  // Earnings
  Future<Json> earnings() => _obj(api.get('/withdrawals/earnings'));
  Future<Json> setPayoutMethod(Json body) => _obj(api.put('/withdrawals/method', body));
  Future<Json> requestWithdrawal(int amount) => _obj(api.post('/withdrawals', {'amount': amount}));

  // Notifications
  Future<Json> notifications({int page = 1}) => _obj(api.get('/notifications', query: {'page': page}));
  Future<Json> markNotificationsRead([String? id]) =>
      _obj(api.post('/notifications/read', id != null ? {'id': id} : <String, dynamic>{}));

  // Account
  Future<Json> updateMe(Json body) => _obj(api.patch('/users/me', body));
}
