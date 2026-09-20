import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, ArrowUpRight, BadgeCheck, Scale, Search, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/motion/Reveal';
import { CATEGORIES } from '@/lib/constants';

const STATS = [
  { value: '9', label: 'Trades covered', sub: 'plumbing to elderly care' },
  { value: '48', label: 'Hours to hire', sub: 'post, negotiate, book' },
  { value: '5%', label: 'Platform fee', sub: 'no listing charges' },
  { value: '100%', label: 'Escrow held', sub: 'released on completion' },
];

const STEPS = [
  {
    n: '01',
    title: 'Describe it in your own words',
    body: '“Need someone to fix a leaking pipe today.” No categories to guess at — the matcher reads intent and surfaces the right trade nearby.',
  },
  {
    n: '02',
    title: 'See what it should cost',
    body: 'A fair-price range for your city, trade and duration before you commit. Workers get the same number, so nobody negotiates blind.',
  },
  {
    n: '03',
    title: 'Agree, then pay safely',
    body: 'Structured offers and counter-offers in one thread. Payment sits in escrow and is only released when you confirm the work is done.',
  },
];

const PILLARS = [
  {
    icon: Sparkles,
    kicker: 'Matching',
    title: 'Ranked by fit, not by who paid',
    body: 'Skills, distance, rating and Trust Score combine into one score — with the reasons shown on every result.',
  },
  {
    icon: Scale,
    kicker: 'Pricing',
    title: 'A fair number for both sides',
    body: 'Local rate data turns a guess into a range, so workers are not underpaid and clients are not overcharged.',
  },
  {
    icon: ShieldCheck,
    kicker: 'Trust',
    title: 'Earned, and shown as one score',
    body: 'Completion rate, repeat hires, response time, disputes and ID verification — a single 0–100 signal you can filter by.',
  },
];

function HeroMatchCard() {
  return (
    <div className="relative w-full" aria-hidden>
      <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-primary-500/40 to-transparent" />
      <div className="relative rounded-xl border border-white/10 bg-ink-900/80 p-4 backdrop-blur transition-transform duration-500 hover:-translate-y-1 lg:p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-primary-400 uppercase">
          <Sparkles className="size-3" /> Top match · 86%
        </p>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-md bg-primary-500 font-display text-base font-extrabold text-white">MY</span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-display text-base font-bold text-white">
              Muhammad Yousaf
              <BadgeCheck className="size-4 text-primary-400" />
            </p>
            <p className="text-sm text-ink-400">Plumber · 12 yrs · Lahore</p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-ink-300 [font-size:clamp(0.8rem,1vw,0.875rem)]">
          {['Skills match what you described', 'Rated 4.6 by 49 clients', 'Only 4 km away'].map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary-500" />
              {r}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">Daily rate</p>
            <p className="numeric font-display text-xl font-extrabold text-white lg:text-2xl">Rs 2,800</p>
          </div>
          <span className="rounded-sm border border-success-500/30 bg-success-500/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-success-500 uppercase">
            Fair price
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const onSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(`/workers${q ? `?q=${encodeURIComponent(q)}&mode=smart` : ''}`);
  };

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="grid-lines absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -top-40 -right-32 size-[34rem] animate-glow rounded-full bg-primary-500/20 blur-[120px]" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-10 lg:pt-16 lg:pb-14">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="animate-rise">
              <p className="inline-flex items-center gap-2 rounded-sm border border-white/15 px-2 py-1 text-[11px] font-semibold tracking-[0.14em] text-ink-300 uppercase">
                <span className="size-1.5 rounded-full bg-primary-500" />
                AI-matched local labour · Pakistan
              </p>

              <h1 className="mt-5 font-display font-extrabold text-white [font-size:clamp(2.5rem,6.2vw,5rem)] [line-height:0.95] [letter-spacing:-0.04em]">
                Hire trusted
                <br />
                local workers
                <br />
                <span className="text-primary-500">by the day.</span>
              </h1>

              <p className="mt-5 max-w-lg text-ink-400 [font-size:clamp(0.95rem,1.2vw,1.125rem)]">
                Plumbers, electricians, house help and more — matched to what you actually need, priced fairly, and paid
                only when the job is done.
              </p>

              <form onSubmit={onSearch} role="search" className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row">
                <label htmlFor="hero-search" className="sr-only">
                  What do you need done?
                </label>
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
                  <input
                    id="hero-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Fix a leaking pipe today…"
                    className="h-12 w-full rounded-md border border-white/15 bg-white/5 pr-3 pl-10 text-base text-white placeholder:text-ink-500 focus:border-primary-500 focus:bg-white/10 focus:outline-none"
                  />
                </div>
                <Button type="submit" variant="accent" size="lg">
                  Find workers <ArrowRight className="size-4" aria-hidden />
                </Button>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-400">
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="size-4 text-primary-500" aria-hidden /> ID-verified workers
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary-500" aria-hidden /> Escrow-protected payment
                </span>
              </div>
            </div>

            <div className="hidden animate-rise lg:block" style={{ animationDelay: '120ms' }}>
              <HeroMatchCard />
            </div>
          </div>
        </div>

        {/* Marquee of trades — gives the fold a floor instead of dead space */}
        <div className="relative border-t border-white/10 py-4">
          <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <ul className="flex shrink-0 animate-marquee items-center gap-8 pr-8" aria-hidden>
              {[...CATEGORIES, ...CATEGORIES].map((c, i) => (
                <li key={`${c.value}-${i}`} className="flex items-center gap-2 text-sm whitespace-nowrap text-ink-500">
                  <c.icon className="size-4" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
          <span className="sr-only">Trades covered: {CATEGORIES.map((c) => c.label).join(', ')}</span>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="border-b border-ink-200">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-ink-200 px-4 md:grid-cols-4 md:divide-x">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 70} className="px-2 py-8 md:px-6">
              <dt className="numeric font-display text-4xl font-extrabold text-ink-950">{s.value}</dt>
              <dd className="mt-1">
                <span className="block text-sm font-semibold text-ink-900">{s.label}</span>
                <span className="block text-sm text-ink-500">{s.sub}</span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-600 uppercase">How it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl lg:text-4xl">Three steps from “my pipe is leaking” to a worker at your door.</h2>
        </Reveal>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.n} delay={i * 90} className="group bg-white p-6 transition-colors hover:bg-ink-50 lg:p-8">
              <span className="numeric font-display text-sm font-extrabold text-primary-500">{step.n}</span>
              <h3 className="mt-4 text-xl">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-500">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── What makes it different ──────────────────────────── */}
      <section className="border-y border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-600 uppercase">Why it's different</p>
              <h2 className="mt-3 max-w-xl text-3xl lg:text-4xl">Not a directory. A system that prices and protects the work.</h2>
            </div>
            <Button variant="outline" to="/workers">
              Browse workers <ArrowUpRight className="size-4" aria-hidden />
            </Button>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <article className="h-full rounded-lg border border-ink-200 bg-white p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink-950">
                  <p.icon className="size-5 text-primary-500" aria-hidden />
                  <p className="mt-5 text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">{p.kicker}</p>
                  <h3 className="mt-2 text-lg">{p.title}</h3>
                  <p className="mt-2 text-sm text-ink-500">{p.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trades ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="flex items-end justify-between gap-4">
          <h2 className="text-3xl">Find your trade</h2>
          <Link to="/workers" className="text-sm font-semibold text-ink-950 underline decoration-primary-500 decoration-2 underline-offset-4">
            See all
          </Link>
        </Reveal>

        <ul className="mt-8 grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.slice(0, 12).map(({ value, label, icon: Icon }, i) => (
            <Reveal as="li" key={value} delay={i * 30} className="bg-white">
              <Link
                to={`/workers?category=${value}`}
                className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-950"
              >
                <Icon className="size-4 text-ink-400 transition-colors group-hover:text-primary-500" aria-hidden />
                <span className="flex-1 text-sm font-semibold text-ink-900 transition-colors group-hover:text-white">{label}</span>
                <ArrowUpRight className="size-4 text-ink-300 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-500" aria-hidden />
              </Link>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ── Dual CTA ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-px overflow-hidden rounded-xl border border-ink-950 bg-ink-950 md:grid-cols-2">
          <Reveal className="bg-ink-950 p-8 text-white lg:p-12">
            <h2 className="text-3xl text-white">Need work done?</h2>
            <p className="mt-3 max-w-sm text-ink-400">Post a job in under two minutes and get offers from verified workers nearby.</p>
            <Button variant="accent" size="lg" to="/register?role=client" className="mt-8">
              Post a job <ArrowRight className="size-4" aria-hidden />
            </Button>
          </Reveal>
          <Reveal delay={90} className="bg-white p-8 lg:p-12">
            <h2 className="text-3xl">Looking for work?</h2>
            <p className="mt-3 max-w-sm text-ink-500">Set your own rates, get matched to jobs near you, and know the money is already secured.</p>
            <Button size="lg" to="/register?role=worker" className="mt-8">
              Join as a worker <ArrowRight className="size-4" aria-hidden />
            </Button>
          </Reveal>
        </div>
      </section>
    </>
  );
}
