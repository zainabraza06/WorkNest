import 'package:flutter/material.dart';

/// Kept in lock-step with backend/src/constants and frontend/src/lib/constants.js.
class Category {
  const Category(this.value, this.label, this.icon);
  final String value;
  final String label;
  final IconData icon;
}

const categories = <Category>[
  Category('plumbing', 'Plumbing', Icons.water_drop_outlined),
  Category('electrical', 'Electrical', Icons.electrical_services),
  Category('carpentry', 'Carpentry', Icons.handyman_outlined),
  Category('painting', 'Painting', Icons.format_paint_outlined),
  Category('masonry', 'Masonry', Icons.foundation),
  Category('cleaning', 'Cleaning', Icons.cleaning_services_outlined),
  Category('house_help', 'House help', Icons.home_outlined),
  Category('cooking', 'Cooking', Icons.restaurant_outlined),
  Category('babysitting', 'Babysitting', Icons.child_care),
  Category('elderly_care', 'Elderly care', Icons.volunteer_activism_outlined),
  Category('gardening', 'Gardening', Icons.grass),
  Category('driving', 'Driving', Icons.directions_car_outlined),
  Category('ac_repair', 'AC repair', Icons.ac_unit),
  Category('appliance_repair', 'Appliance repair', Icons.local_laundry_service_outlined),
  Category('welding', 'Welding', Icons.local_fire_department_outlined),
  Category('moving_labor', 'Moving & loading', Icons.inventory_2_outlined),
  Category('security_guard', 'Security guard', Icons.shield_outlined),
  Category('other', 'Other', Icons.build_outlined),
];

final categoryMap = {for (final c in categories) c.value: c};

const durationTypes = {'one_day': 'One day', 'weekly': 'Weekly', 'monthly': 'Monthly'};

const urgencies = {
  'flexible': 'Flexible',
  'normal': 'Within a few days',
  'urgent': 'Urgent (today / tomorrow)',
};

/// name -> (lat, lng). Used as the job/profile location, as on the web.
const cities = <String, (double, double)>{
  'Karachi': (24.8607, 67.0011),
  'Lahore': (31.5204, 74.3587),
  'Islamabad': (33.6844, 73.0479),
  'Rawalpindi': (33.5651, 73.0169),
  'Faisalabad': (31.4504, 73.135),
  'Multan': (30.1575, 71.5249),
  'Peshawar': (34.0151, 71.5249),
  'Quetta': (30.1798, 66.975),
  'Hyderabad': (25.396, 68.3578),
  'Sialkot': (32.4945, 74.5229),
  'Gujranwala': (32.1877, 74.1945),
  'Other': (30.3753, 69.3451),
};

/// Status presentation, matching frontend bookingMeta.js / JOB_STATUS_META.
enum Tone { neutral, solid, success, warning, danger }

const bookingStatusMeta = <String, (String, Tone)>{
  'pending_payment': ('Awaiting payment', Tone.warning),
  'confirmed': ('Confirmed', Tone.solid),
  'in_progress': ('In progress', Tone.success),
  'completed': ('Completed', Tone.neutral),
  'cancelled': ('Cancelled', Tone.danger),
  'disputed': ('Disputed', Tone.danger),
};

const jobStatusMeta = <String, (String, Tone)>{
  'posted': ('Open', Tone.neutral),
  'negotiating': ('Negotiating', Tone.solid),
  'confirmed': ('Confirmed', Tone.success),
  'in_progress': ('In progress', Tone.success),
  'completed': ('Completed', Tone.neutral),
  'reviewed': ('Reviewed', Tone.neutral),
  'cancelled': ('Cancelled', Tone.danger),
};
