import { useState } from 'react';
import { Link } from 'react-router';
import { Mail, Lock } from 'lucide-react';

import { useLogin } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { AuthShell } from './AuthShell';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const login = useLogin();
  const fieldErrors = login.error?.fieldErrors ?? {};

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const onSubmit = (e) => {
    e.preventDefault();
    login.mutate(form);
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your jobs and offers."
      footer={
        <>
          New to WorkNest?{' '}
          <Link to="/register" className="font-semibold text-primary-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {login.error && !Object.keys(fieldErrors).length && <InlineAlert>{login.error.message}</InlineAlert>}
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={onChange}
          error={fieldErrors.email}
          leading={<Mail className="size-4" />}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
          leading={<Lock className="size-4" />}
        />
        <Button type="submit" size="lg" loading={login.isPending} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
