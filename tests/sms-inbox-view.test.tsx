import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SmsInboxView } from '../src/components/sms/SmsInboxView.tsx';
import type { SmsConversation, SmsMessage } from '../src/lib/sms/types.ts';

const noop = () => {};

const baseConversation = (overrides: Partial<SmsConversation>): SmsConversation => ({
  id: 'conv-1',
  phone_e164: '+15551112222',
  display_name: 'Ada Lovelace',
  unread_count: 2,
  last_message_at: '2026-10-03T15:00:00.000Z',
  last_message_preview: 'Closing Friday?',
  last_direction: 'inbound',
  consent: 'unknown',
  ...overrides,
});

function render(overrides: Partial<React.ComponentProps<typeof SmsInboxView>> = {}) {
  return renderToStaticMarkup(
    <SmsInboxView
      conversations={[baseConversation({})]}
      selectedId="conv-1"
      messages={[{
        id: 'msg-1',
        direction: 'inbound',
        body: 'Closing Friday?',
        status: 'received',
        created_at: '2026-10-03T15:00:00.000Z',
        error_code: null,
        error_message: null,
      } satisfies SmsMessage]}
      contact={{
        id: '42',
        name: 'Ada Lovelace',
        stage: 'Under Contract',
        tags: ['buyer'],
        phones: [{ value: '+15551112222', type: 'mobile' }],
        emails: [{ value: 'ada@example.com' }],
      }}
      contactState="matched"
      contactFetchedAt="2026-10-03T15:05:00.000Z"
      loadingList={false}
      loadingThread={false}
      sending={false}
      error={null}
      search=""
      draft="The title company has the package."
      newDraft=""
      newPhone=""
      showNew={false}
      showContact
      onSearch={noop}
      onSelect={noop}
      onBack={noop}
      onDraft={noop}
      onNewDraft={noop}
      onSend={noop}
      onSendNew={noop}
      onToggleNew={noop}
      onNewPhone={noop}
      onRefreshContact={noop}
      onToggleContact={noop}
      {...overrides}
    />,
  );
}

test('shows the thread, unread count, contact card, and opt-in warning', () => {
  const html = render();
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Closing Friday\?/);
  assert.match(html, />2</);
  assert.match(html, /Under Contract/);
  assert.match(html, /buyer/);
  assert.match(html, /ada@example.com/);
  assert.match(html, /sms-consent-warning/);
  assert.match(html, /never opted in/);
  assert.doesNotMatch(html, /disabled=""/);
});

test('disables sending when the number has opted out', () => {
  const html = render({
    conversations: [baseConversation({ consent: 'opted_out', unread_count: 0 })],
    draft: 'Hello',
  });
  assert.match(html, /sms-opt-out-banner/);
  assert.match(html, /Sending is blocked/);
  assert.match(html, /disabled=""/);
});
