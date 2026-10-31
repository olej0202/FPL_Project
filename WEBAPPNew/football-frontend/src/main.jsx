import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import AppProviders from './app/AppProviders';
import ScrollToTop from './components/ScrollTop';
import './index.css';
import './styles/components.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter>
    <ScrollToTop />
    <AppProviders><App /></AppProviders>
  </HashRouter>,
);
