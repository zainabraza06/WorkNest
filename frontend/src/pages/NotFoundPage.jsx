import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have been moved."
        action={<Button to="/">Back to home</Button>}
      />
    </div>
  );
}
