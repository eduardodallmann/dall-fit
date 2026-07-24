import { useState } from 'react';

import { Button, Card } from '@heroui/react';

import {
  Description,
  Eyebrow,
  InlineCode,
  Page,
  PageContent,
  Title,
} from '~/routes/home/styles';

export function HomePage() {
  const [count, setCount] = useState(0);

  return (
    <Page>
      <PageContent>
        <Card>
          <Card.Header>
            <Eyebrow>Dall Fit</Eyebrow>
            <Title>Get started</Title>
            <Description>
              Edit <InlineCode>src/routes/home/index.tsx</InlineCode> and save
              to test HMR.
            </Description>
          </Card.Header>
          <Card.Footer>
            <Button
              type="button"
              onPress={() => setCount((currentCount) => currentCount + 1)}
            >
              Count is {count}
            </Button>
          </Card.Footer>
        </Card>
      </PageContent>
    </Page>
  );
}
