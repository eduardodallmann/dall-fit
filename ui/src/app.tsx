import { RouterProvider } from '@tanstack/react-router';
import { Analytics } from '@vercel/analytics/react';

import { allowOnlineAnalyticsEvent } from '~/core/analytics';
import { router } from '~/routes/routes';

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Analytics
        beforeSend={allowOnlineAnalyticsEvent}
        debug={false}
        mode={import.meta.env.PROD ? 'production' : 'development'}
      />
    </>
  );
}

export default App;
