import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Sky } from './components/Sky';
import { LoadingBlock } from './components/ui';
import { Forecast } from './pages/Forecast';
import { NotFound } from './pages/NotFound';

// The Forecast is the landing page; everything else (and api-drift itself) loads on demand.
const ApiDetail = lazy(() => import('./pages/ApiDetail').then((m) => ({ default: m.ApiDetail })));
const Changes = lazy(() => import('./pages/Changes').then((m) => ({ default: m.Changes })));
const Playground = lazy(() => import('./pages/Playground'));
const WatchYourOwn = lazy(() => import('./pages/WatchYourOwn'));
const About = lazy(() => import('./pages/About'));

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Suspense fallback={<LoadingBlock />}>
          <Routes location={location}>
            <Route path="/" element={<Forecast />} />
            <Route path="/api/:id" element={<ApiDetail />} />
            <Route path="/changes" element={<Changes />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/watch-your-own" element={<WatchYourOwn />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter basename={basename}>
        <Sky />
        <ScrollManager />
        <Layout>
          <AnimatedRoutes />
        </Layout>
      </BrowserRouter>
    </MotionConfig>
  );
}
