import { Link } from 'react-router';
import { Glyph } from '../components/Glyph';
import { useDocumentTitle } from '../lib/hooks';

export function NotFound() {
  useDocumentTitle('Not found');
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <Glyph condition="fog" size={120} />
      <p className="kicker mt-6">404 · visibility nil</p>
      <h1 className="mt-3 font-serif text-5xl text-ink">Lost in the fog</h1>
      <p className="mt-4 text-ink-2">This page drifted off the map, or never existed. The forecast is still where you left it.</p>
      <Link to="/" className="btn btn-primary mt-8">
        Back to the forecast
      </Link>
    </div>
  );
}
