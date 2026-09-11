import { Routes, Route } from 'react-router';

function Placeholder() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-extrabold">WorkNest</h1>
      <p className="text-lg text-ink-600">Hire trusted local workers — by the day or by the month.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Placeholder />} />
    </Routes>
  );
}
