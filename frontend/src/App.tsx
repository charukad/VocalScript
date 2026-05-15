import { useEffect, useState } from 'react';
import { EditorLayout } from './components/editor/EditorLayout';
import { ContentStudioLayout } from './features/contentStudio/ContentStudioLayout';
import './App.css';

function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return hash === '#content-studio' ? <ContentStudioLayout /> : <EditorLayout />;
}

export default App;
