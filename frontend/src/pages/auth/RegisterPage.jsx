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
          <Link to="/login" className="font-semibold text-primary-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-800">How will you use WorkNest?</legend>
          <div className="grid grid-cols-2 gap-3">
            {roles.map(({ value, title, body, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'relative flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 transition-colors',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-600',
                  form.role === value ? 'border-primary-600 bg-primary-50' : 'border-ink-200 hover:border-ink-300',
                )}
              >
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={onChange} className="sr-only" />
                <Icon className={cn('size-5', form.role === value ? 'text-primary-700' : 'text-ink-500')} aria-hidden />
                <span className="text-sm font-semibold text-ink-900">{title}</span>
                <span className="text-xs text-ink-600">{body}</span>
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
