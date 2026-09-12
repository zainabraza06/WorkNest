import {
  Baby,
  Brush,
  Car,
  ChefHat,
  Droplets,
  Flame,
  Hammer,
  HeartHandshake,
  Home,
  Leaf,
  PackageOpen,
  Plug,
  Shield,
  Snowflake,
  Sparkles,
  BrickWall,
  WashingMachine,
  Wrench,
} from 'lucide-react';

export const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing', icon: Droplets },
  { value: 'electrical', label: 'Electrical', icon: Plug },
  { value: 'carpentry', label: 'Carpentry', icon: Hammer },
  { value: 'painting', label: 'Painting', icon: Brush },
  { value: 'masonry', label: 'Masonry', icon: BrickWall },
  { value: 'cleaning', label: 'Cleaning', icon: Sparkles },
  { value: 'house_help', label: 'House help', icon: Home },
  { value: 'cooking', label: 'Cooking', icon: ChefHat },
  { value: 'babysitting', label: 'Babysitting', icon: Baby },
  { value: 'elderly_care', label: 'Elderly care', icon: HeartHandshake },
  { value: 'gardening', label: 'Gardening', icon: Leaf },
  { value: 'driving', label: 'Driving', icon: Car },
  { value: 'ac_repair', label: 'AC repair', icon: Snowflake },
  { value: 'appliance_repair', label: 'Appliance repair', icon: WashingMachine },
  { value: 'welding', label: 'Welding', icon: Flame },
  { value: 'moving_labor', label: 'Moving & loading', icon: PackageOpen },
  { value: 'security_guard', label: 'Security guard', icon: Shield },
  { value: 'other', label: 'Other', icon: Wrench },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

export const DURATION_TYPES = [
  { value: 'one_day', label: 'One day', unit: 'day', unitPlural: 'days' },
  { value: 'weekly', label: 'Weekly', unit: 'week', unitPlural: 'weeks' },
  { value: 'monthly', label: 'Monthly', unit: 'month', unitPlural: 'months' },
];

export const DURATION_MAP = Object.fromEntries(DURATION_TYPES.map((d) => [d.value, d]));

export const URGENCY = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'normal', label: 'Within a few days' },
  { value: 'urgent', label: 'Urgent (today / tomorrow)' },
];

// Approximate city centres, used as default map/geo coordinates
export const CITIES = [
  { value: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { value: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { value: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  { value: 'Rawalpindi', lat: 33.5651, lng: 73.0169 },
  { value: 'Faisalabad', lat: 31.4504, lng: 73.135 },
  { value: 'Multan', lat: 30.1575, lng: 71.5249 },
  { value: 'Peshawar', lat: 34.0151, lng: 71.5249 },
  { value: 'Quetta', lat: 30.1798, lng: 66.975 },
  { value: 'Hyderabad', lat: 25.396, lng: 68.3578 },
  { value: 'Sialkot', lat: 32.4945, lng: 74.5229 },
  { value: 'Gujranwala', lat: 32.1877, lng: 74.1945 },
  { value: 'Other', lat: 30.3753, lng: 69.3451 },
];

export const CITY_MAP = Object.fromEntries(CITIES.map((c) => [c.value, c]));

export const JOB_STATUS_META = {
  posted: { label: 'Open', tone: 'primary' },
  negotiating: { label: 'Negotiating', tone: 'secondary' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  reviewed: { label: 'Reviewed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};
