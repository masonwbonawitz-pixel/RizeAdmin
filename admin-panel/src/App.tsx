import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import AdminView from './AdminView';
import './index.css';

function App() {
  return (
    <AppProvider i18n={{}}>
      <AdminView />
    </AppProvider>
  );
}

export default App;

