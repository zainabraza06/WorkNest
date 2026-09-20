import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Briefcase, HardHat } from 'lucide-react';

import { useRegister } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { AuthShell } from './AuthShell';

const roles = [
  { value: 'client', title: 'I want to hire', body: 'Post jobs and hire workers', icon: Briefcase },
  { value: 'worker', title: 'I want to work', body: 'Find jobs and get paid', icon: HardHat },
];

export default function RegisterPage() {
  const [params] = useSearchParams();
  const initialRole = ['worker', 'client'].includes(params.get('role')) ? params.get('role') : 'client';
  const [form, setForm] = useState({ role: initialRole, name: '', email: '', phone: '', password: '' });
  const register = useRegister();
  const fieldErrors = register.error?.fieldErrors ?? {};

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const onSubmit = (e) => {
    e.preventDefault();
    const { phone, ...rest } = form;
    register.mutate(phone.trim() ? { ...rest, phone: phone.trim() } : rest);
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free for workers and clients."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink-950 underline decoration-primary-500 decoration-2 underline-offset-4 hover:decoration-ink-950">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">How will you use WorkNest?</legend>
          <div className="grid grid-cols-2 gap-3">
            {roles.map(({ value, title, body, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'relative flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-600',
                  form.role === value ? 'border-ink-950 bg-ink-950' : 'border-ink-300 hover:border-ink-950',
                )}
              >
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={onChange} className="sr-only" />
                <Icon className={cn('size-4', form.role === value ? 'text-primary-500' : 'text-ink-400')} aria-hidden />
                <span className={cn('text-sm font-bold', form.role === value ? 'text-white' : 'text-ink-950')}>{title}</span>
                <span className={cn('text-xs', form.role === value ? 'text-ink-400' : 'text-ink-500')}>{body}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {register.error && !Object.keys(fieldErrors).length && <InlineAlert>{register.error.message}</InlineAlert>}

        <Input label="Full name" name="name" autoComplete="name" required value={form.name} onChange={onChange} error={fieldErrors.name} />
        <Input label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={onChange} error={fieldErrors.email} />
        <Input
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="03XX XXXXXXX"
          hint="Optional — only shared after a booking is confirmed."
          value={form.phone}
          onChange={onChange}
          error={fieldErrors.phone}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, with a letter and a number."
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
        />
        <Button type="submit" size="lg" loading={register.isPending} className="mt-2 w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
