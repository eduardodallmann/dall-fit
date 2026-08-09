import { RouterProvider } from '@tanstack/react-router';
import { Analytics } from '@vercel/analytics/react';

import { router } from '~/routes/routes';

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Analytics
        debug={false}
        mode={import.meta.env.PROD ? 'production' : 'development'}
      />
    </>
  );
}

export default App;
