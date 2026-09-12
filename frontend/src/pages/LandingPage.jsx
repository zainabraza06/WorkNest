import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, BadgeCheck, Handshake, Scale, Search, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { TrustScoreRing } from '@/components/ui/TrustScore';
import { CATEGORIES } from '@/lib/constants';

const featured = CATEGORIES.filter((c) =>
  ['plumbing', 'electrical', 'house_help', 'painting', 'ac_repair', 'carpentry', 'cleaning', 'driving'].includes(c.value),
);

const steps = [
  { icon: Search, title: 'Describe the work', body: 'Type what you need in plain words — “fix a leaking pipe today” — and we find matching workers nearby.' },
  { icon: Scale, title: 'See a fair price', body: 'Get a suggested price range for the job, so nobody gets underpaid or overcharged.' },
  { icon: Handshake, title: 'Negotiate & book', body: 'Send offers and counter-offers in one thread. Payment is held safely until the job is done.' },
];

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const onSearch = (e) => {
    e.preventDefault();
    navigate(`/workers${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 to-ink-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-800 shadow-card">
              <Sparkles className="size-3.5" aria-hidden /> AI-matched local workers across Pakistan
            </p>
            <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl sm:leading-[1.1]">
              Hire trusted local workers — <span className="text-primary-700">for a day or a month.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-600">
              Plumbers, electricians, house help and more. Transparent prices, verified profiles, and payment held
              safely until the work is done.
            </p>

            <form onSubmit={onSearch} role="search" className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-raised sm:flex-row">
              <label htmlFor="hero-search" className="sr-only">
                What do you need done?
              </label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
                <input
                  id="hero-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. need someone to fix a leaking pipe today"
                  className="h-12 w-full rounded-xl border-0 pr-3 pl-10 text-base placeholder:text-ink-400 focus:ring-2 focus:ring-primary-600/30 focus:outline-none"
                />
              </div>
              <Button type="submit" size="lg">
                Find workers
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-primary-700" aria-hidden /> ID-verified workers
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary-700" aria-hidden /> Escrow-protected payments
              </span>
            </div>
          </div>

          {/* Illustrative profile card */}
          <div className="relative mx-auto w-full max-w-sm" aria-hidden>
            <div className="absolute -top-6 -right-6 size-40 rounded-full bg-secondary-200/60 blur-2xl" />
            <div className="relative rounded-2xl border border-ink-200 bg-white p-5 shadow-raised">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary-100 font-display text-lg font-bold text-primary-800">AR</div>
                <div className="flex-1">
                  <p className="font-semibold text-ink-900">Ahmed Raza</p>
                  <p className="text-sm text-ink-600">Electrician · 9 yrs · Lahore</p>
                </div>
                <TrustScoreRing score={92} size={52} />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Wiring', 'UPS install', 'DB boards'].map((s) => (
                  <span key={s} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-700">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
                <div>
                  <p className="text-xs text-ink-500">Daily rate</p>
                  <p className="font-display text-xl font-bold">Rs 3,500</p>
                </div>
                <span className="rounded-lg bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">Fair price ✓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold">Popular services</h2>
          <Link to="/workers" className="text-sm font-semibold text-primary-700 hover:underline">
            See all
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {featured.map(({ value, label, icon: Icon }) => (
            <li key={value}>
              <Link
                to={`/workers?category=${value}`}
                className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-card transition hover:border-primary-300 hover:shadow-raised"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 group-hover:bg-primary-100">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-ink-800">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="border-y border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold">How WorkNest works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary-100 text-secondary-800">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">
                    <span className="text-ink-400">{i + 1}.</span> {title}
                  </h3>
                  <p className="mt-1 text-sm text-ink-600">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Dual CTA */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 md:grid-cols-2">
        <div className="rounded-2xl bg-primary-800 p-8 text-white">
          <h2 className="text-2xl font-bold text-white">Need work done?</h2>
          <p className="mt-2 text-primary-100">Post a job in under two minutes and get offers from nearby workers.</p>
          <Button variant="secondary" size="lg" to="/register?role=client" className="mt-6">
            Post a job <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-8">
          <h2 className="text-2xl font-bold">Looking for work?</h2>
          <p className="mt-2 text-ink-600">Create a free profile, set your own rates and get hired for daily or monthly jobs.</p>
          <Button size="lg" to="/register?role=worker" className="mt-6">
            Join as a worker <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </section>
    </>
  );
}
